import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, rpc }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("appointOfficial", () => {
  it("calls the admin_appoint_official RPC with the given fields", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "admin-1" } } });
    rpc.mockResolvedValue({ error: null });
    const { appointOfficial } = await import("./appoint-official");

    const result = await appointOfficial({
      email: "juan@example.com",
      area: "Barangay Nilombot, Mapandan",
      displayName: "Juan Dela Cruz, BDRRMO Nilombot",
    });

    expect(rpc).toHaveBeenCalledWith("admin_appoint_official", {
      p_email: "juan@example.com",
      p_area: "Barangay Nilombot, Mapandan",
      p_display_name: "Juan Dela Cruz, BDRRMO Nilombot",
    });
    expect(result).toEqual({ ok: true });
  });

  it("reports no session as a permanent failure when the caller is signed out", async () => {
    getClaims.mockResolvedValue({ data: null });
    const { appointOfficial } = await import("./appoint-official");

    const result = await appointOfficial({ email: "x@example.com", area: "Mapandan", displayName: "X" });

    expect(result).toEqual({ ok: false, permanent: true, error: "No session — sign in and try again." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces the database's own error message rather than a generic failure", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "admin-1" } } });
    rpc.mockResolvedValue({ error: { message: "No account for x@example.com. Ask them to sign in once first." } });
    const { appointOfficial } = await import("./appoint-official");

    const result = await appointOfficial({ email: "x@example.com", area: "Mapandan", displayName: "X" });

    expect(result).toEqual({
      ok: false,
      permanent: true,
      error: "No account for x@example.com. Ask them to sign in once first.",
    });
  });
});
