import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, from }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
});

describe("recordCheckIn", () => {
  it("upserts on (zone_id, user_id) so changing safe to needs_help is not a duplicate", async () => {
    // The report action treats 23505 as success because a replayed report is
    // the same report. A check-in is not: a resident who said "safe" and now
    // needs help produces a second write on the same constraint, and swallowing
    // it as success would discard the most consequential message in the app.
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });
    const { recordCheckIn } = await import("./record-check-in");

    await recordCheckIn({
      id: "22222222-2222-4222-8222-222222222222",
      zoneId: "zone-1",
      status: "needs_help",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ zone_id: "zone-1", user_id: "user-1", status: "needs_help" }),
      expect.objectContaining({ onConflict: "zone_id,user_id" })
    );
  });

  it("attributes the check-in to the uid from the verified claim, never to client input", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });
    const { recordCheckIn } = await import("./record-check-in");

    await recordCheckIn({ id: "id-1", zoneId: "zone-1", status: "safe" });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1" }),
      expect.anything()
    );
  });

  it("rejects a status that is neither safe nor needs_help without contacting the database", async () => {
    const { recordCheckIn } = await import("./record-check-in");

    const result = await recordCheckIn({
      id: "id-1",
      zoneId: "zone-1",
      status: "unsure" as never,
    });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.any(String) });
    expect(from).not.toHaveBeenCalled();
  });

  it("treats a missing session as transient, so a resident's answer is retried rather than lost", async () => {
    getClaims.mockResolvedValue({ data: { claims: undefined } });
    const { recordCheckIn } = await import("./record-check-in");

    const result = await recordCheckIn({ id: "id-1", zoneId: "zone-1", status: "safe" });

    expect(result).toEqual({ ok: false, permanent: false, error: expect.any(String) });
    expect(from).not.toHaveBeenCalled();
  });

  it("treats a foreign-key violation as permanent — a zone that does not exist never will", async () => {
    from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: { code: "23503", message: "fk" } }),
    });
    const { recordCheckIn } = await import("./record-check-in");

    const result = await recordCheckIn({ id: "id-1", zoneId: "missing-zone", status: "safe" });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.any(String) });
  });

  it("never reports a unique violation as success — a changed answer is not a replay", async () => {
    // The trap: createPin's rule ("23505 is success, because a replayed
    // insert under the same id is the same row") does not transfer here. The
    // table is unique on (zone_id, user_id), not on the outbox's own id, so
    // a collision is a genuine second write, and swallowing it as success
    // would silently discard the resident's changed answer.
    from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate key" } }),
    });
    const { recordCheckIn } = await import("./record-check-in");

    const result = await recordCheckIn({ id: "id-1", zoneId: "zone-1", status: "needs_help" });

    expect(result.ok).toBe(false);
  });

  it("sends checked_in_at when madeAt is given, so a queued check-in keeps the time it was made", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });
    const { recordCheckIn } = await import("./record-check-in");

    await recordCheckIn({
      id: "id-1",
      zoneId: "zone-1",
      status: "safe",
      madeAt: "2026-09-16T02:00:00.000Z",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ checked_in_at: "2026-09-16T02:00:00.000Z" }),
      expect.anything()
    );
  });

  it("sends no checked_in_at key at all when madeAt is not given", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });
    const { recordCheckIn } = await import("./record-check-in");

    await recordCheckIn({ id: "id-1", zoneId: "zone-1", status: "safe" });

    const payload = upsert.mock.calls[0][0];
    expect(payload).not.toHaveProperty("checked_in_at");
  });

  it("treats a 22023 refusal as permanent, without the report-specific too_old reason", async () => {
    // private.honest_check_in_time() refuses a check-in claiming to be more
    // than 3 days old. Retrying cannot help, so the queue must stop — but the
    // "report again if it is still flooded" copy that reason "too_old" carries
    // is about water-level reports, not check-ins.
    const upsert = vi.fn().mockResolvedValue({ error: { code: "22023", message: "check-in too old" } });
    from.mockReturnValue({ upsert });
    const { recordCheckIn } = await import("./record-check-in");

    const result = await recordCheckIn({ id: "id-1", zoneId: "zone-1", status: "safe", madeAt: "2020-01-01T00:00:00.000Z" });

    expect(result).toMatchObject({ ok: false, permanent: true, error: "check-in too old" });
    expect(result).not.toHaveProperty("reason");
  });
});
