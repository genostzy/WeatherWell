import { describe, it, expect, vi, beforeEach } from "vitest";

const loadOfficial = vi.fn();
vi.mock("@/lib/auth/load-official", () => ({ loadOfficial: () => loadOfficial() }));
const redirect = vi.fn((path: string): never => {
  void path;
  throw new Error("NEXT_REDIRECT");
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
const eq = vi.fn();
const maybeSingle = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({ select: () => ({ eq: (col: string, val: string) => (eq(col, val), { maybeSingle }) }) }),
  }),
}));
vi.mock("@/features/admin/admin-overview", () => ({ AdminOverview: () => null }));

import AdminPage from "./page";

const barangay = { userId: "u", displayName: "K", areaCode: "0105528012", areaName: "Nilombot", level: "barangay" };

beforeEach(() => vi.clearAllMocks());

describe("/admin landing (found checking the live site)", () => {
  it("sends a barangay official to their own barangay, looking up only that barangay", async () => {
    loadOfficial.mockResolvedValue({ state: "official", official: barangay });
    maybeSingle.mockResolvedValue({ data: { id: "zone-1" }, error: null });
    await expect(AdminPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(eq).toHaveBeenCalledWith("psgc_barangay_code", "0105528012");
    expect(redirect).toHaveBeenCalledWith("/admin/zone/zone-1");
  });

  it("shows the overview when the barangay isn't found, and to municipal officials", async () => {
    loadOfficial.mockResolvedValue({ state: "official", official: barangay });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(AdminPage()).resolves.toBeTruthy();
    loadOfficial.mockResolvedValue({ state: "official", official: { ...barangay, level: "municipality", areaCode: "0105528" } });
    await expect(AdminPage()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
