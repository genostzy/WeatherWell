import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const profilesEq = vi.fn();
const zonesOr = vi.fn();
const from = vi.fn((table: string) =>
  table === "profiles" ? { select: () => ({ eq: profilesEq }) } : { select: () => ({ or: zonesOr }) }
);
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from, rpc }) }));

const notifyResidentsOfAlertChange = vi.fn();
vi.mock("@/lib/notify-residents", () => ({
  notifyResidentsOfAlertChange: (...args: unknown[]) => notifyResidentsOfAlertChange(...args),
}));

import { forecastAdvisoryCopy, runRainForecast } from "./rain-forecast";

const ZONES = [
  { id: "z-wet", lat: 16.02, lng: 120.45 },
  { id: "z-dry", lat: 16.03, lng: 120.46 },
];
// Run at 05:30 UTC. Open-Meteo stamps each hour's total at its end, starting with the hour already past.
const NOW = new Date("2026-10-01T05:30:00Z");
const TIMES = ["2026-10-01T05:00", "2026-10-01T06:00", "2026-10-01T07:00", "2026-10-01T08:00"];
const hours = (mm: (number | null)[]) => ({ hourly: { time: TIMES, precipitation: mm } });

function openMeteo(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  profilesEq.mockResolvedValue({
    data: [{ area_code: "0105528" }, { area_code: "0105528012" }, { area_code: null }],
    error: null,
  });
  zonesOr.mockResolvedValue({ data: ZONES, error: null });
  rpc.mockImplementation(async (_name: string, args: { p_starts_at: string | null }) => ({
    data: args.p_starts_at ? "raised" : "ended",
    error: null,
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("forecastAdvisoryCopy", () => {
  it("says when, in Philippine time, and how heavy, in both languages", () => {
    const { message, timing } = forecastAdvisoryCopy("2026-10-01T07:00:00Z", 21.6);
    expect(message.en).toBe(
      "Forecast advisory — heavy rain expected from about 3 PM (up to 22 mm in an hour, Open-Meteo forecast). Prepare now; this is a forecast, not a report."
    );
    expect(message.fil).toBe(
      "Paalala mula sa forecast — inaasahan ang malakas na ulan mula bandang 3 PM (hanggang 22 mm sa isang oras, ayon sa forecast ng Open-Meteo). Maghanda na; forecast ito, hindi ulat."
    );
    expect(timing).toEqual({ en: "From about 3 PM", fil: "Mula bandang 3 PM" });
  });
});

describe("runRainForecast", () => {
  it("asks Open-Meteo once for every barangay in towns with an official", async () => {
    const fetchMock = openMeteo([hours([30, 2, 16, 22]), hours([1, 1, 2, 3])]);
    await runRainForecast();
    expect(zonesOr).toHaveBeenCalledWith("psgc_barangay_code.like.0105528*");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("latitude")).toBe("16.02,16.03");
    expect(url.searchParams.get("longitude")).toBe("120.45,120.46");
    expect(url.searchParams.get("hourly")).toBe("precipitation");
    expect(url.searchParams.get("forecast_hours")).toBe("7");
    expect(url.searchParams.get("timezone")).toBe("UTC");
  });

  it("raises where heavy rain is coming, ends where it is not, and tells residents of a new one only", async () => {
    openMeteo([hours([30, 2, 16, 22]), hours([1, 1, 2, 3])]);
    const result = await runRainForecast();
    // 16 mm falls in the hour stamped 07:00, so from 06:00 UTC (2 PM); the 30 mm hour is already past.
    const copy = forecastAdvisoryCopy("2026-10-01T06:00:00.000Z", 22);
    expect(rpc).toHaveBeenCalledWith("set_forecast_advisory", {
      p_zone_id: "z-wet",
      p_starts_at: "2026-10-01T06:00:00.000Z",
      p_peak_at: "2026-10-01T08:00:00.000Z",
      p_peak_mm: 22,
      p_message: copy.message,
      p_timing: copy.timing,
    });
    expect(rpc).toHaveBeenCalledWith("set_forecast_advisory", {
      p_zone_id: "z-dry",
      p_starts_at: null,
      p_peak_at: null,
      p_peak_mm: null,
      p_message: null,
      p_timing: null,
    });
    expect(notifyResidentsOfAlertChange.mock.calls).toEqual([["z-wet", "set"]]);
    expect(result).toEqual({ checked: 2, raised: ["z-wet"], ended: 1 });
  });

  it("does not tell residents again about one it kept", async () => {
    openMeteo([hours([30, 2, 16, 22]), hours([1, 1, 2, 3])]);
    rpc.mockResolvedValue({ data: "kept", error: null });
    await runRainForecast();
    expect(notifyResidentsOfAlertChange).not.toHaveBeenCalled();
  });

  it("accepts one location's object in place of a list", async () => {
    zonesOr.mockResolvedValue({ data: [ZONES[0]], error: null });
    openMeteo(hours([null, null, 15, 3]));
    const result = await runRainForecast();
    expect(rpc).toHaveBeenCalledWith(
      "set_forecast_advisory",
      expect.objectContaining({ p_zone_id: "z-wet", p_starts_at: "2026-10-01T06:00:00.000Z", p_peak_mm: 15 })
    );
    expect(result.raised).toEqual(["z-wet"]);
  });

  it("changes nothing and fails loudly when Open-Meteo fails", async () => {
    openMeteo({ error: true }, false);
    await expect(runRainForecast()).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    expect(notifyResidentsOfAlertChange).not.toHaveBeenCalled();
  });

  it("fails loudly, changing nothing, when a place comes back without its hours", async () => {
    openMeteo([hours([30, 2, 16, 22]), {}]);
    await expect(runRainForecast()).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails loudly, after the rest, when the database refuses a barangay", async () => {
    openMeteo([hours([30, 2, 16, 22]), hours([1, 1, 2, 3])]);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });
    await expect(runRainForecast()).rejects.toThrow("down");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("does nothing where no town has an official", async () => {
    profilesEq.mockResolvedValue({ data: [], error: null });
    const fetchMock = openMeteo([]);
    expect(await runRainForecast()).toEqual({ checked: 0, raised: [], ended: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
