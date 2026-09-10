import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, from }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: "voter-1" } } });
});

describe("voteOnPin", () => {
  it("upserts on (pin_id, voter_id) so changing a vote is not a duplicate", async () => {
    // The primary key is (pin_id, voter_id). A plain insert would collide the
    // moment a resident changes their mind, and — following the report
    // action's rule — 23505 would be reported as success while the vote
    // stayed as it was.
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert, select: vi.fn() });
    const { voteOnPin } = await import("./vote-on-pin");

    await voteOnPin({ pinId: "pin-1", direction: -1 });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ pin_id: "pin-1", voter_id: "voter-1", direction: -1 }),
      expect.objectContaining({ onConflict: "pin_id,voter_id" })
    );
  });

  it("attributes the vote to the uid from the verified claim, never to client input", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert, select: vi.fn() });
    const { voteOnPin } = await import("./vote-on-pin");

    await voteOnPin({ pinId: "pin-1", direction: 1 });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ voter_id: "voter-1" }),
      expect.anything()
    );
  });

  it("treats a foreign-key violation as TRANSIENT, because the pin may still be queued", async () => {
    // A resident creates a pin and votes on it with no signal. Both sit in
    // one queue, and on the next drain the vote may reach the server a
    // moment before its pin. Classifying 23503 permanent here — as every
    // other action correctly does — bins the vote for good.
    from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: { code: "23503", message: "fk" } }),
      select: vi.fn(),
    });
    const { voteOnPin } = await import("./vote-on-pin");

    const result = await voteOnPin({ pinId: "pin-1", direction: 1 });

    expect(result).toEqual({ ok: false, permanent: false, error: expect.any(String) });
  });

  it("rejects a direction that is neither 1 nor -1 without contacting the database", async () => {
    const { voteOnPin } = await import("./vote-on-pin");

    const result = await voteOnPin({ pinId: "pin-1", direction: 5 as 1 });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.any(String) });
    expect(from).not.toHaveBeenCalled();
  });
});
