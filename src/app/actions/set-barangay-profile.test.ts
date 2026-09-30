import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, rpc }),
}));

import { setBarangayProfile } from "./set-barangay-profile";

const INPUT = { zoneId: "zone-1", flood: "high", landslide: "low", stormSurge: "unknown", downstreamZoneId: "zone-2" } as const;
const SAVED = { id: "zone-1", flood: "high", landslide: "low", storm_surge: "unknown", downstream_zone_id: "zone-2" };

beforeEach(() => vi.clearAllMocks());

describe("setBarangayProfile", () => {
  it("calls the database function and returns what it saved", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    rpc.mockResolvedValue({ data: SAVED, error: null });
    expect(await setBarangayProfile(INPUT)).toEqual({ ok: true, saved: SAVED });
    expect(rpc).toHaveBeenCalledWith("set_barangay_profile", {
      p_zone_id: "zone-1",
      p_flood: "high",
      p_landslide: "low",
      p_storm_surge: "unknown",
      p_downstream_zone_id: "zone-2",
    });
  });

  it("refuses without a session", async () => {
    getClaims.mockResolvedValue({ data: null });
    expect(await setBarangayProfile(INPUT)).toEqual({ ok: false, permanent: true, error: "No session — sign in and try again." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes a database refusal through", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    rpc.mockResolvedValue({ data: null, error: { message: "the downstream barangay must be within 20 km" } });
    expect(await setBarangayProfile(INPUT)).toEqual({
      ok: false,
      permanent: true,
      error: "the downstream barangay must be within 20 km",
    });
  });
});
