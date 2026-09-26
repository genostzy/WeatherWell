import { describe, it, expect, vi, beforeEach } from "vitest";

// Each call to range() answers the next page from `pages`.
const pages: { data: { zone_id: string; step: number }[] | null; error: { message: string } | null }[] = [];
const range = vi.fn(async () => pages.shift() ?? { data: [], error: null });
const gt = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({
      select: () => ({ gt: (...args: unknown[]) => (gt(...args), { order: () => ({ range }) }) }),
    }),
  }),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  pages.length = 0;
});

describe("GET /api/alert-bars (Stage 4 calibration)", () => {
  it("names each barangay whose bar the calibration loop has raised, and its step", async () => {
    pages.push({ data: [{ zone_id: "zone-1", step: 2 }], error: null });
    const res = await GET();
    expect(await res.json()).toEqual({ "zone-1": 2 });
    expect(gt).toHaveBeenCalledWith("step", 0);
  });

  it("reads past the database's 1,000-row page, so no raised bar is dropped (review)", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ zone_id: `zone-${i}`, step: 1 }));
    pages.push({ data: full, error: null }, { data: [{ zone_id: "zone-1000", step: 3 }], error: null });
    const bars = (await (await GET()).json()) as Record<string, number>;
    expect(Object.keys(bars)).toHaveLength(1001);
    expect(bars["zone-1000"]).toBe(3);
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("is a 502, not an empty answer, when the database fails", async () => {
    pages.push({ data: null, error: { message: "down" } });
    expect((await GET()).status).toBe(502);
  });
});
