import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, rpc }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("removeOfficial", () => {
  it("calls the admin_remove_official RPC with the given email", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "admin-1" } } });
    rpc.mockResolvedValue({ error: null });
    const { removeOfficial } = await import("./remove-official");

    const result = await removeOfficial({ email: "juan@example.com" });

    expect(rpc).toHaveBeenCalledWith("admin_remove_official", { p_email: "juan@example.com" });
    expect(result).toEqual({ ok: true });
  });

  it("reports no session as a permanent failure when the caller is signed out", async () => {
    getClaims.mockResolvedValue({ data: null });
    const { removeOfficial } = await import("./remove-official");

    const result = await removeOfficial({ email: "x@example.com" });

    expect(result).toEqual({ ok: false, permanent: true, error: "No session — sign in and try again." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces the database's own error message", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "admin-1" } } });
    rpc.mockResolvedValue({ error: { message: "No official with email x@example.com." } });
    const { removeOfficial } = await import("./remove-official");

    const result = await removeOfficial({ email: "x@example.com" });

    expect(result).toEqual({ ok: false, permanent: true, error: "No official with email x@example.com." });
  });
});
