import { describe, it, expect, vi } from "vitest";

const insert = vi.fn();
const getClaims = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({
    auth: { getClaims },
    from: () => ({ insert }),
  }),
}));

const scheduled: Array<() => unknown> = [];
vi.mock("next/server", () => ({ after: (task: () => unknown) => scheduled.push(task) }));
const runThresholdCheck = vi.fn(async () => ({ ok: true, triggered: 0, pushSent: 0, results: [] }));
vi.mock("@/lib/threshold-check", () => ({ runThresholdCheck: () => runThresholdCheck() }));

import { submitWaterLevelReport } from "./submit-water-level-report";

describe("submitWaterLevelReport", () => {
  it("treats a missing session as transient, so the queued report is retried rather than binned", async () => {
    // A missing or expired cookie is the most TEMPORARY failure in this
    // system, and the one most likely to coincide with the bad connectivity
    // the outbox exists for. Classifying it permanent makes drainOutbox skip
    // the entry forever and mergeReports drop it from the screen — so a
    // resident already shown "Report recorded" loses the report silently.
    getClaims.mockResolvedValue({ data: null });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    expect(result).toEqual({
      ok: false,
      permanent: false,
      error: expect.stringMatching(/sign|session|auth/i),
    });
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
    // Only a 22023 refusal carries reason "too_old"; nothing else may.
    expect(result).not.toHaveProperty("reason");
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
    // Only a 22023 refusal carries reason "too_old"; nothing else may.
    expect(result).not.toHaveProperty("reason");
  });

  it("sends reported_at when madeAt is given, so a queued report keeps the time it was made", async () => {
    // The outbox may replay this hours after the report was actually filed.
    // madeAt carries the honest time through to the database trigger.
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: null });

    await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
      madeAt: "2026-09-16T02:00:00.000Z",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ reported_at: "2026-09-16T02:00:00.000Z" })
    );
  });

  it("sends no reported_at key at all when madeAt is not given", async () => {
    // Letting the column default to the server clock (rather than sending an
    // explicit "now") keeps this action's ordinary, non-queued path
    // unchanged.
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: null });

    await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    const payload = insert.mock.calls[0][0];
    expect(payload).not.toHaveProperty("reported_at");
  });

  it("sends lat/lng when the device supplied a position", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: null });

    await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
      lat: 16.0,
      lng: 120.436,
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ lat: 16.0, lng: 120.436 }));
  });

  it("sends no lat/lng keys at all when the device had no position — the geofence trigger must skip, not reject", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: null });

    await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    const payload = insert.mock.calls[0][0];
    expect(payload).not.toHaveProperty("lat");
    expect(payload).not.toHaveProperty("lng");
  });

  it("maps a too-old report (22023) to a permanent failure with reason too_old", async () => {
    // private.honest_report_time() refuses a report more than 6 hours old --
    // this can never succeed on retry, so the outbox must drop it for good,
    // not keep resending it.
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: { code: "22023", message: "report too old" } });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
      madeAt: "2020-01-01T00:00:00.000Z",
    });

    expect(result).toEqual({
      ok: false,
      permanent: true,
      reason: "too_old",
      error: "report too old",
    });
  });

  it("names a report from outside the barangay too_far, so the resident is told why it was refused", async () => {
    // The geofence trigger's refusal (check_violation). Seen on production 2026-09-25 as "This couldn't be accepted."
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({
      error: { code: "23514", message: "Report location is too far from the zone being reported." },
    });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
      lat: 18.2,
      lng: 120.6,
    });

    expect(result).toMatchObject({ ok: false, permanent: true, reason: "too_far" });
  });

  it("keeps a report sent within 5 minutes of the last one queued, and names it rate_limited", async () => {
    // The rate-limit trigger's refusal (raise_exception). The outbox sends it once the window passes;
    // the reason lets the phone say so instead of "Will send when online".
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({
      error: {
        code: "P0001",
        message: "Too many reports for this zone from this device — wait a few minutes before reporting again.",
      },
    });

    const result = await submitWaterLevelReport({
      id: "11111111-1111-1111-1111-111111111111",
      zoneId: "zone-1",
      depthLevel: "knee",
    });

    expect(result).toMatchObject({ ok: false, permanent: false, reason: "rate_limited" });
  });

  it("evaluates the alert threshold right after a report is saved, without making the resident wait", async () => {
    // The scheduled engine ran at best every 3 hours; flood water does not wait.
    scheduled.length = 0;
    runThresholdCheck.mockClear();
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: null });

    const result = await submitWaterLevelReport({ id: "22222222-2222-2222-2222-222222222222", zoneId: "zone-1", depthLevel: "knee" });

    expect(result).toEqual({ ok: true });
    expect(runThresholdCheck).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]();
    expect(runThresholdCheck).toHaveBeenCalledOnce();
  });

  it("does not run the engine for a report that was refused", async () => {
    scheduled.length = 0;
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    insert.mockResolvedValue({ error: { code: "23514", message: "too far" } });

    await submitWaterLevelReport({ id: "33333333-3333-3333-3333-333333333333", zoneId: "zone-1", depthLevel: "knee" });

    expect(scheduled).toHaveLength(0);
  });
});
