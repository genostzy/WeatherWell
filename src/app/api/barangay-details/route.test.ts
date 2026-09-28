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

const ROW = {
  id: "zone-1",
  hotline_number: "0917 123 4567",
  extra_hotlines: ["(075) 522-1234"],
  evacuation_route_text: { en: "Go to the school.", fil: "Pumunta sa paaralan." },
};

beforeEach(() => vi.clearAllMocks());

describe("GET /api/barangay-details", () => {
  it("lists only barangays an official has filled in", async () => {
    range.mockResolvedValue({ data: [ROW], error: null });
    const res = await GET();
    expect(await res.json()).toEqual([ROW]);
    expect(from).toHaveBeenCalledWith("zones");
    expect(select).toHaveBeenCalledWith("id, hotline_number, extra_hotlines, evacuation_route_text");
    expect(not).toHaveBeenCalledWith("details_set_at", "is", null);
    expect(order).toHaveBeenCalledWith("id");
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=30");
  });

  it("reads past 1,000 rows", async () => {
    range
      .mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => ({ ...ROW, id: `zone-${i}` })), error: null })
      .mockResolvedValueOnce({ data: [{ ...ROW, id: "zone-last" }], error: null });
    const body = await (await GET()).json();
    expect(body).toHaveLength(1001);
    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("is a 502, not an empty list, when the database fails", async () => {
    range.mockResolvedValue({ data: null, error: { message: "down" } });
    expect((await GET()).status).toBe(502);
  });
});
