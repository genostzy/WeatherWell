import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
const or = vi.fn(() => ({ limit: query }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ from: () => ({ select: () => ({ or }) }) }),
}));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/centres", () => {
  it("returns only centres that differ from the seed placeholder", async () => {
    const row = { zone_id: "zone-1", name: "School", lat: 1, lng: 2, capacity: 300, status: "full", current_occupancy: 280 };
    query.mockResolvedValue({ data: [row], error: null });
    const res = await GET();
    expect(await res.json()).toEqual([row]);
    expect(or).toHaveBeenCalledWith("status.neq.unknown,capacity.gt.0,current_occupancy.not.is.null");
  });

  it("is a 502, not an empty list, when the database fails", async () => {
    query.mockResolvedValue({ data: null, error: { message: "down" } });
    expect((await GET()).status).toBe(502);
  });
});
