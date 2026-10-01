import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, rpc }),
}));

const calls: string[] = [];
const remove = vi.fn(async (paths: string[]) => {
  calls.push(`remove ${paths.join(",")}`);
  return { data: [], error: null };
});
const deleteUser = vi.fn(async (id: string) => {
  calls.push(`deleteUser ${id}`);
  return { data: {}, error: null };
});
const storageFrom = vi.fn(() => ({ remove }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: storageFrom }, auth: { admin: { deleteUser } } }),
}));

import { deleteMyData } from "./delete-my-data";

const ME = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  getClaims.mockResolvedValue({ data: { claims: { sub: ME } } });
  rpc.mockResolvedValue({ data: ["me/a.jpg", "me/b.jpg"], error: null });
});

describe("deleteMyData", () => {
  it("needs a session, and touches nothing without one", async () => {
    getClaims.mockResolvedValue({ data: null });
    expect(await deleteMyData()).toEqual({ ok: false, permanent: true, error: expect.any(String) });
    expect(rpc).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("passes on the database's refusal and deletes nothing else", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Only a resident can delete their data here." } });
    expect(await deleteMyData()).toEqual({
      ok: false,
      permanent: true,
      error: "Only a resident can delete their data here.",
    });
    expect(remove).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the photos, then the account", async () => {
    expect(await deleteMyData()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("delete_my_data");
    expect(storageFrom).toHaveBeenCalledWith("pin-photos");
    expect(calls).toEqual(["remove me/a.jpg,me/b.jpg", `deleteUser ${ME}`]);
  });

  it("still deletes the account when the photos could not be deleted", async () => {
    remove.mockResolvedValueOnce({ data: null, error: { message: "storage down" } } as never);
    expect(await deleteMyData()).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledWith(ME);
  });

  it("asks for another try when the account could not be deleted", async () => {
    deleteUser.mockResolvedValueOnce({ data: null, error: { message: "auth down" } } as never);
    expect(await deleteMyData()).toEqual({ ok: false, permanent: false, error: "auth down" });
  });

  it("finishes quietly on a second try after the account is already gone", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    deleteUser.mockResolvedValueOnce({ data: null, error: { message: "User not found" } } as never);
    expect(await deleteMyData()).toEqual({ ok: true });
    expect(remove).not.toHaveBeenCalled();
  });
});
