import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const zoneLookup = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: zoneLookup }) }) }),
  }),
}));

import { GET } from "./route";

const fetchMock = vi.fn();
const SCHOOL = { elements: [{ type: "node", lat: 16.03, lon: 120.437, tags: { amenity: "school", name: "Nilombot ES" } }] };

beforeEach(() => {
  vi.clearAllMocks();
  zoneLookup.mockResolvedValue({ data: { lat: 16.0288, lng: 120.4366 }, error: null });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const get = (q: string) => GET(new Request(`https://x/api/evacuation-candidates${q}`));

describe("GET /api/evacuation-candidates", () => {
  it("returns named sites near the barangay, CDN-cached only on success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => SCHOOL });
    const res = await get("?zoneId=zone-1");
    expect((await res.json())[0]).toMatchObject({ name: "Nilombot ES", kind: "school" });
    expect(res.headers.get("Cache-Control")).toContain("s-maxage");
  });

  it("treats an Overpass timeout remark (sent as HTTP 200) as a failure, not an empty answer to cache", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ elements: [], remark: "runtime error: Query timed out" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => SCHOOL });
    const res = await get("?zoneId=zone-1");
    expect(await res.json()).toHaveLength(1);
  });

  it("never lets a failed lookup be cached", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const res = await get("?zoneId=zone-1");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("falls back to the second Overpass mirror when the first is busy", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => SCHOOL });
    const res = await get("?zoneId=zone-1");
    expect(await res.json()).toHaveLength(1);
    expect(fetchMock.mock.calls[1][0]).not.toBe(fetchMock.mock.calls[0][0]);
  });

  it("falls back to Nominatim when every Overpass server is busy", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("nominatim")) {
        return {
          ok: true,
          json: async () =>
            String(url).includes("amenity=school")
              ? [{ name: "Nilombot Elementary School", type: "school", lat: "16.0281", lon: "120.4364" }]
              : [{ name: "Mapandan Municipal Hall", type: "townhall", lat: "16.03", lon: "120.45" }],
        };
      }
      return { ok: true, json: async () => ({ elements: [], remark: "runtime error: too busy" }) };
    });
    const res = await get("?zoneId=zone-1");
    const body = await res.json();
    expect(body.map((c: { name: string }) => c.name)).toEqual(["Nilombot Elementary School", "Mapandan Municipal Hall"]);
    expect(body[1].kind).toBe("hall");
    const nominatimCall = fetchMock.mock.calls.find(([url]) => String(url).includes("nominatim"))!;
    expect(nominatimCall[1].headers["User-Agent"]).toMatch(/WeatherWell/);
  }, 10_000);

  it("answers an empty list, not an error, when every mirror fails", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    const res = await get("?zoneId=zone-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("400s without a zone and 404s an unknown one", async () => {
    expect((await get("")).status).toBe(400);
    zoneLookup.mockResolvedValueOnce({ data: null, error: null });
    expect((await get("?zoneId=nope")).status).toBe(404);
  });
});
