import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const zoneLookup = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: zoneLookup }) }) }),
  }),
}));

import { POST } from "./route";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  zoneLookup.mockResolvedValue({ data: { lat: 16.0288, lng: 120.4366 }, error: null });
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ elevation: [8, 14] }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

/** The old query strings, sent the way the route now takes them: in a POST body (privacy review). */
function bodyOf(qs: string): string {
  const pairs = [...new URLSearchParams(qs)].map(([key, value]) => [key, Number.isFinite(Number(value)) ? Number(value) : value]);
  return JSON.stringify(Object.fromEntries(pairs));
}
const post = (query: string) => POST(new Request("https://x/api/elevation", { method: "POST", body: bodyOf(query) }));

describe("POST /api/elevation", () => {
  it("has no GET, so a position never sits in an address that logs and history keep (privacy review)", async () => {
    expect(await import("./route")).not.toHaveProperty("GET");
  });

  it("returns the height here and at the barangay centre", async () => {
    const res = await post("?zoneId=zone-1&lat=16.02911&lng=120.43127");
    expect(await res.json()).toEqual({ here: 8, centre: 14 });
  });

  it("sends Open-Meteo a position rounded to about 100 m, never the exact one", async () => {
    await post("?zoneId=zone-1&lat=16.02911&lng=120.43127");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("latitude=16.029,16.0288");
    expect(url).toContain("longitude=120.431,120.4366");
  });

  it("refuses a missing or impossible position", async () => {
    expect((await post("?zoneId=zone-1&lat=abc&lng=120")).status).toBe(400);
    expect((await post("?zoneId=zone-1&lat=95&lng=120")).status).toBe(400);
    expect((await post("?zoneId=zone-1")).status).toBe(400);
  });

  it("404s an unknown barangay and 502s when Open-Meteo fails", async () => {
    zoneLookup.mockResolvedValueOnce({ data: null, error: null });
    expect((await post("?zoneId=nope&lat=16&lng=120")).status).toBe(404);
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    expect((await post("?zoneId=zone-1&lat=16&lng=120")).status).toBe(502);
  });
});
