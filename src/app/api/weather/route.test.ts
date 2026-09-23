import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const zoneLookup = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: zoneLookup }) }) }),
  }),
}));

import { GET } from "./route";

const REPLY = {
  current: { time: "2026-09-23T19:15", wind_speed_10m: 10, temperature_2m: 26, apparent_temperature: 30, relative_humidity_2m: 90, weather_code: 3 },
  hourly: { time: ["2026-09-23T18:00", "2026-09-23T19:00", "2026-09-23T20:00"], precipitation: [1, 2, 9] },
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  zoneLookup.mockResolvedValue({ data: { lat: 16.03, lng: 120.43 }, error: null });
  fetchMock.mockResolvedValue({ ok: true, json: async () => REPLY });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function get(query: string) {
  return GET(new Request(`https://x/api/weather${query}`));
}

describe("GET /api/weather", () => {
  it("returns live Open-Meteo conditions for the zone's own coordinates", async () => {
    const res = await get("?zoneId=zone-1");
    const body = await res.json();

    expect(fetchMock.mock.calls[0][0]).toContain("latitude=16.03");
    expect(fetchMock.mock.calls[0][0]).toContain("longitude=120.43");
    expect(body.zoneId).toBe("zone-1");
    expect(body.current.rainfall_mm).toBe(2);
    expect(body.rainfallHistory).toEqual([1, 2]);
    expect(body.rainfallForecast).toEqual([9]);
    expect(body.source).toBe("open-meteo");
  });

  it("requires a zoneId", async () => {
    expect((await get("")).status).toBe(400);
  });

  it("404s for an unknown zone rather than inventing weather", async () => {
    zoneLookup.mockResolvedValue({ data: null, error: null });
    expect((await get("?zoneId=nope")).status).toBe(404);
  });

  it("reports an upstream failure as 502, never as zero rain", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    expect((await get("?zoneId=zone-1")).status).toBe(502);
  });
});

describe("GET /api/weather river forecast (idea 1)", () => {
  it("adds the river outlook from Open-Meteo's flood API", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes("flood-api")
          ? { daily: { time: [today, tomorrow], river_discharge: [40, 90], river_discharge_max: [40, 130] } }
          : REPLY,
    }));
    const body = await (await get("?zoneId=zone-1")).json();
    expect(body.river).toMatchObject({ trend: "rising", todayM3s: 40, peakM3s: 90, worstM3s: 130 });
    expect(body.current.rainfall_mm).toBe(2);
  });

  it("still returns the weather when the river forecast fails", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("flood-api") ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => REPLY }
    );
    const res = await get("?zoneId=zone-1");
    expect(res.status).toBe(200);
    expect((await res.json()).river).toBeNull();
  });
});
