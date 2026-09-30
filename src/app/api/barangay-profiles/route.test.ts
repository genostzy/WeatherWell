import { describe, it, expect, vi, beforeEach } from "vitest";

const range = vi.fn();
const order = vi.fn(() => ({ range }));
const not = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ not }));
const from = vi.fn(() => ({ select }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ from }),
}));

import { GET } from "./route";

const DB_ROW = {
  id: "zone-1",
  downstream_zone_id: "zone-2",
  hazard_susceptibility: [
    { hazard_type: "flood", risk_level: "high" },
    { hazard_type: "landslide", risk_level: "low" },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("GET /api/barangay-profiles", () => {
  it("lists only barangays whose officials set a profile, a missing level as unknown", async () => {
    range.mockResolvedValue({ data: [DB_ROW], error: null });
    const res = await GET();
    expect(await res.json()).toEqual([
      { id: "zone-1", flood: "high", landslide: "low", storm_surge: "unknown", downstream_zone_id: "zone-2" },
    ]);
    expect(from).toHaveBeenCalledWith("zones");
    expect(select).toHaveBeenCalledWith("id, downstream_zone_id, hazard_susceptibility(hazard_type, risk_level)");
    expect(not).toHaveBeenCalledWith("profile_set_at", "is", null);
    expect(order).toHaveBeenCalledWith("id");
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=30");
  });

  it("reads past 1,000 rows", async () => {
    range
      .mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => ({ ...DB_ROW, id: `zone-${i}` })), error: null })
      .mockResolvedValueOnce({ data: [{ ...DB_ROW, id: "zone-last" }], error: null });
    expect(await (await GET()).json()).toHaveLength(1001);
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("is a 502, not an empty list, when the database fails", async () => {
    range.mockResolvedValue({ data: null, error: { message: "down" } });
    expect((await GET()).status).toBe(502);
  });
});
