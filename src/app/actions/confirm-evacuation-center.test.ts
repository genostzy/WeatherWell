import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, rpc }),
}));

import { confirmEvacuationCenter } from "./confirm-evacuation-center";

const INPUT = { zoneId: "zone-1", name: "Nilombot ES", lat: 16.03, lng: 120.437, capacity: 300 };

beforeEach(() => vi.clearAllMocks());

describe("confirmEvacuationCenter (idea 10)", () => {
  it("calls the database function, which does the area and distance checks", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    rpc.mockResolvedValue({ error: null });
    expect(await confirmEvacuationCenter(INPUT)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("confirm_evacuation_center", {
      p_zone_id: "zone-1",
      p_name: "Nilombot ES",
      p_lat: 16.03,
      p_lng: 120.437,
      p_capacity: 300,
    });
  });

  it("refuses without a session", async () => {
    getClaims.mockResolvedValue({ data: null });
    expect(await confirmEvacuationCenter(INPUT)).toMatchObject({ ok: false, error: expect.stringMatching(/^No session/) });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a capacity that is not a whole number before calling anything", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    expect((await confirmEvacuationCenter({ ...INPUT, capacity: 2.5 })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes the database's refusal through", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    rpc.mockResolvedValue({ error: { message: "centre must be within 5 km of the barangay" } });
    expect(await confirmEvacuationCenter(INPUT)).toEqual({
      ok: false,
      permanent: true,
      error: "centre must be within 5 km of the barangay",
    });
  });
});
