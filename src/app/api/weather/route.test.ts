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
