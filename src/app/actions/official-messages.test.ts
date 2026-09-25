import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const getClaims = vi.fn();
vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ rpc, auth: { getClaims } }),
}));
const notifyOfficialsOfMessage = vi.fn();
vi.mock("@/lib/notify-officials", () => ({ notifyOfficialsOfMessage: (id: string) => notifyOfficialsOfMessage(id) }));

import { sendOfficialMessage } from "./official-messages";

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } } });
});

describe("sendOfficialMessage", () => {
  it("notifies the right officials once the update is saved", async () => {
    rpc.mockResolvedValue({ data: "msg-1", error: null });
    expect(await sendOfficialMessage({ kind: "need_help", body: "Boat" })).toEqual({ ok: true });
    expect(notifyOfficialsOfMessage).toHaveBeenCalledWith("msg-1");
  });

  it("notifies nobody when the database refuses it", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "only a barangay or municipal official can send updates" } });
    expect((await sendOfficialMessage({ kind: "update", body: "x" })).ok).toBe(false);
    expect(notifyOfficialsOfMessage).not.toHaveBeenCalled();
  });
});
