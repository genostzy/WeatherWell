import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, rpc }),
}));

import { setBarangayDetails } from "./set-barangay-details";

const INPUT = { zoneId: "zone-1", hotlines: ["0917 123 4567"], instructions: { en: "Go", fil: "" } };
const SAVED = {
  id: "zone-1",
  hotline_number: "0917 123 4567",
  extra_hotlines: [],
  evacuation_route_text: { en: "Go", fil: "Go" },
};

beforeEach(() => vi.clearAllMocks());

describe("setBarangayDetails", () => {
  it("calls the database function and returns what it saved", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    rpc.mockResolvedValue({ data: SAVED, error: null });
    expect(await setBarangayDetails(INPUT)).toEqual({ ok: true, saved: SAVED });
    expect(rpc).toHaveBeenCalledWith("set_barangay_details", {
      p_zone_id: "zone-1",
      p_hotlines: ["0917 123 4567"],
      p_instructions_en: "Go",
      p_instructions_fil: "",
    });
  });

  it("refuses without a session", async () => {
    getClaims.mockResolvedValue({ data: null });
    expect(await setBarangayDetails(INPUT)).toEqual({
      ok: false,
      permanent: true,
      error: "No session — sign in and try again.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes a database refusal through", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "official-1" } } });
    rpc.mockResolvedValue({ data: null, error: { message: "at most 3 hotline numbers" } });
    expect(await setBarangayDetails(INPUT)).toEqual({ ok: false, permanent: true, error: "at most 3 hotline numbers" });
  });
});
