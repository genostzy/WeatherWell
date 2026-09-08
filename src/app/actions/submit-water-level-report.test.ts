import { describe, it, expect, vi } from "vitest";

const insert = vi.fn();
const getClaims = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({
    auth: { getClaims },
    from: () => ({ insert }),
  }),
}));

import { submitWaterLevelReport } from "./submit-water-level-report";

describe("submitWaterLevelReport", () => {
  it("refuses a report with no session, permanently", async () => {
    // Not transient: without a principal there is no reporter_id to attribute
    // it to, and retrying with the same absent session cannot help.
    getClaims.mockResolvedValue({ data: null });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.stringMatching(/sign|session|auth/i) });
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a depth level that is not one of the five", async () => {
    // The five are a closed vocabulary a resident picks from a picture. A
    // sixth value means a caller is constructing requests by hand.
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "shoulder" as never,
    });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.stringMatching(/depth/i) });
    expect(insert).not.toHaveBeenCalled();
  });

  it("attributes the row to the caller's own uid, never to a client-supplied one", async () => {
    // The RLS policy checks auth.uid() = reporter_id, so a mismatch is refused
    // anyway — but the action must not even try to file as someone else.
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: null });

    await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ reporter_id: "user-1", id: "11111111-1111-1111-1111-111111111111" })
    );
  });

  it("treats a duplicate primary key as success, because replay is expected", async () => {
    // The outbox re-sends anything it did not see confirmed. A write that
    // landed before the connection dropped must not surface as an error.
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    expect(result).toEqual({ ok: true });
  });

  it("reports an RLS denial as permanent, not as something to retry", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: { code: "42501", message: "row-level security" } });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    expect(result).toMatchObject({ ok: false, permanent: true });
  });

  it("reports an unknown database error as transient", async () => {
    // A connection reset must not permanently bin a resident's report.
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: { code: "08006", message: "connection failure" } });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    expect(result).toMatchObject({ ok: false, permanent: false });
  });
});
