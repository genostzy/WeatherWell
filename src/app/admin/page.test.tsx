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
const rpc = vi.fn();
// The calibration record (Stage 4): calibration_events newest first, and the
// raised bars. Each query records the filters it was given.
const events = vi.fn();
const floors = vi.fn();
const calls: Record<string, [string, unknown[]][]> = {};
function query(table: string, result: () => Promise<unknown>) {
  calls[table] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => result().then(resolve, reject),
  };
  for (const method of ["select", "like", "gt", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => (calls[table].push([method, args]), builder);
  }
  return builder;
}
vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({
    rpc,
    from: (table: string) => query(table, table === "calibration_events" ? events : floors),
  }),
}));

import AdminPage from "./page";

const barangay = { userId: "u", displayName: "K", areaCode: "0105528012", areaName: "Nilombot", level: "barangay" };

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: [], error: null });
  events.mockResolvedValue({ data: [], error: null });
  floors.mockResolvedValue({ data: [], error: null });
});

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

  it("hands a municipal official's dashboard their town's barangay officials", async () => {
    loadOfficial.mockResolvedValue({ state: "official", official: { ...barangay, level: "municipality", areaCode: "0105528" } });
    rpc.mockResolvedValue({ data: [{ user_id: "u2", display_name: "Kap Nilo", area_code: "0105528012" }], error: null });
    const page = (await AdminPage()) as { props: { townOfficials: unknown } };
    expect(rpc).toHaveBeenCalledWith("town_officials");
    expect(page.props.townOfficials).toEqual([{ userId: "u2", displayName: "Kap Nilo", areaCode: "0105528012" }]);
  });

  it("hands admins and town officials the calibration record (Stage 4 Task 3)", async () => {
    events.mockResolvedValue({
      data: [{ id: 7, zone_id: "zone-1", kind: "rejected", step_before: 0, step_after: 1, occurred_at: "2026-09-26T01:00:00Z" }],
      error: null,
    });
    floors.mockResolvedValue({ data: [{ zone_id: "zone-1", step: 1 }], error: null });
    loadOfficial.mockResolvedValue({ state: "official", official: { ...barangay, level: "admin", areaCode: "" } });
    const page = (await AdminPage()) as { props: { calibration: unknown } };
    expect(page.props.calibration).toEqual({
      bars: { "zone-1": 1 },
      events: [{ id: 7, zoneId: "zone-1", kind: "rejected", stepBefore: 0, stepAfter: 1, occurredAt: "2026-09-26T01:00:00Z" }],
    });
    // The admin's dashboard is nationwide: no area filter.
    expect(calls.calibration_events.some(([method]) => method === "like")).toBe(false);
  });

  it("reads a town's own calibration record in the query, not the newest 30 nationwide filtered afterwards (review)", async () => {
    loadOfficial.mockResolvedValue({ state: "official", official: { ...barangay, level: "municipality", areaCode: "0105528" } });
    await AdminPage();
    for (const table of ["calibration_events", "zone_alert_floors"]) {
      expect(calls[table]).toContainEqual(["like", ["zones.psgc_barangay_code", "0105528%"]]);
    }
    const limitAt = calls.calibration_events.findIndex(([method]) => method === "limit");
    const likeAt = calls.calibration_events.findIndex(([method]) => method === "like");
    expect(likeAt).toBeGreaterThanOrEqual(0);
    expect(likeAt).toBeLessThan(limitAt);
  });
});
