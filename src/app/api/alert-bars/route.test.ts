import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
const gt = vi.fn(() => query());
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ from: () => ({ select: () => ({ gt }) }) }),
}));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/alert-bars (Stage 4 calibration)", () => {
  it("names each barangay whose bar the calibration loop has raised, and its step", async () => {
    query.mockResolvedValue({ data: [{ zone_id: "zone-1", step: 2 }], error: null });
    const res = await GET();
    expect(await res.json()).toEqual({ "zone-1": 2 });
    expect(gt).toHaveBeenCalledWith("step", 0);
  });

  it("is a 502, not an empty answer, when the database fails", async () => {
    query.mockResolvedValue({ data: null, error: { message: "down" } });
    expect((await GET()).status).toBe(502);
  });
});
