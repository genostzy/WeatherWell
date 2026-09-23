import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const zoneLookup = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: zoneLookup }) }) }),
  }),
}));

import { GET } from "./route";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  zoneLookup.mockResolvedValue({ data: { lat: 16.0288, lng: 120.4366 }, error: null });
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ elevation: [8, 14] }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const get = (query: string) => GET(new Request(`https://x/api/elevation${query}`));

describe("GET /api/elevation", () => {
  it("returns the height here and at the barangay centre", async () => {
    const res = await get("?zoneId=zone-1&lat=16.02911&lng=120.43127");
    expect(await res.json()).toEqual({ here: 8, centre: 14 });
  });

  it("sends Open-Meteo a position rounded to about 100 m, never the exact one", async () => {
    await get("?zoneId=zone-1&lat=16.02911&lng=120.43127");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("latitude=16.029,16.0288");
    expect(url).toContain("longitude=120.431,120.4366");
  });

  it("refuses a missing or impossible position", async () => {
    expect((await get("?zoneId=zone-1&lat=abc&lng=120")).status).toBe(400);
    expect((await get("?zoneId=zone-1&lat=95&lng=120")).status).toBe(400);
    expect((await get("?zoneId=zone-1")).status).toBe(400);
  });

  it("404s an unknown barangay and 502s when Open-Meteo fails", async () => {
    zoneLookup.mockResolvedValueOnce({ data: null, error: null });
    expect((await get("?zoneId=nope&lat=16&lng=120")).status).toBe(404);
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    expect((await get("?zoneId=zone-1&lat=16&lng=120")).status).toBe(502);
  });
});
