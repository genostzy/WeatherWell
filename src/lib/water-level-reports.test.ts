import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const submitWaterLevelReport = vi.fn().mockResolvedValue({ ok: true });
const ensureAnonymousSession = vi.fn().mockResolvedValue(null);

// Both real modules sit behind boundaries this file must not cross:
// submit-water-level-report.ts pulls in user-server.ts, which does
// `import "server-only"` — that throws unconditionally outside a real
// server bundler. water-level-reports.ts only ever reaches it through a
// dynamic import inside dispatchQueuedReport, so most tests below (which
// stub ensureAnonymousSession to resolve null, i.e. offline) never load it
// at all; this mock exists for the one test that does drain for real.
vi.mock("@/app/actions/submit-water-level-report", () => ({
  submitWaterLevelReport: (...args: unknown[]) => submitWaterLevelReport(...args),
}));
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: () => ensureAnonymousSession(),
}));

import {
  addWaterLevelReport,
  getRecentReportsForZoneLive,
  minutesSinceReport,
  mergeReports,
  useWaterLevelReports,
} from "./water-level-reports";
import { readOutbox, enqueue, markFailed, OutboxWriteFailed } from "@/lib/outbox/outbox";

/** No server rows in this file — every case here is about the outbox side of the merge. */
function currentReports() {
  return mergeReports([], readOutbox());
}

describe("water-level-reports", () => {
  beforeEach(() => {
    localStorage.clear();
    submitWaterLevelReport.mockClear();
    ensureAnonymousSession.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a queued report immediately, before it has reached the server", () => {
    // A resident who taps "knee-deep" during a flood must see their report
    // land in the list at once. Waiting on a round trip they may never
    // complete is how the app feels broken exactly when it matters.
    addWaterLevelReport("zone-1", "knee");

    const pending = readOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0].payload).toEqual({ zoneId: "zone-1", depthLevel: "knee" });
  });

  it("gives the optimistic row the same id the server will use", () => {
    // Reconciliation is by id: when the server row arrives it replaces the
    // optimistic one rather than appearing beside it as a duplicate.
    addWaterLevelReport("zone-1", "knee");
    const [queued] = readOutbox();

    const merged = mergeReports([], readOutbox());
    expect(merged.map((r) => r.id)).toEqual([queued.id]);
  });

  it("does not display or count a permanently-failed report", () => {
    // A report the server permanently rejected (RLS denial, CHECK/FK
    // violation) must stop voting: drainOutbox skips a permanentlyFailed
    // entry forever, so if mergeReports kept rendering it, it would count
    // toward the agreeing-report consensus threshold forever too.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    markFailed(entry.id, "new row violates row-level security policy", true);

    expect(mergeReports([], readOutbox())).toHaveLength(0);
  });

  it("does not show a queued report twice once the server row arrives", () => {
    addWaterLevelReport("zone-1", "knee");
    const [queued] = readOutbox();

    const serverRow = {
      id: queued.id,
      zoneId: "zone-1",
      depthLevel: "knee" as const,
      reportedAt: new Date().toISOString(),
      trustWeight: 1,
      isOutlier: false,
      reporterId: "user-1",
    };

    expect(mergeReports([serverRow], readOutbox())).toHaveLength(1);
  });

  it("queues a report a fresh read of the outbox then contains", () => {
    addWaterLevelReport("zone-2", "waist");

    const reports = getRecentReportsForZoneLive(currentReports(), "zone-2");
    expect(reports).toHaveLength(1);
    expect(reports[0].depthLevel).toBe("waist");
  });

  it("gives a freshly queued report a starting trust weight and no outlier flag", () => {
    addWaterLevelReport("zone-1", "dry");
    const [report] = currentReports();
    // 1.0 is PRD's own definition of "unproven device" — reputation scoring
    // is Final Phase, and the same starting point applies whether the row
    // is confirmed or still optimistic.
    expect(report.trustWeight).toBe(1.0);
    expect(report.isOutlier).toBe(false);
    expect(report.reporterId).toBeTruthy();
  });

  it("orders reports newest first", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T10:00:00.000Z"));
    addWaterLevelReport("zone-3", "ankle");
    vi.setSystemTime(new Date("2026-09-01T10:00:01.000Z"));
    addWaterLevelReport("zone-3", "knee");
    vi.useRealTimers();

    const reports = getRecentReportsForZoneLive(currentReports(), "zone-3");
    expect(reports[0].depthLevel).toBe("knee");
    expect(reports[1].depthLevel).toBe("ankle");
  });

  it("reports a just-submitted entry as 0 minutes ago", () => {
    const now = new Date().toISOString();
    expect(minutesSinceReport(now)).toBe(0);
  });

  it("only counts reports for the requested zone", () => {
    addWaterLevelReport("zone-1", "dry");
    addWaterLevelReport("zone-2", "neck");

    const reports = getRecentReportsForZoneLive(currentReports(), "zone-1");
    expect(reports).toHaveLength(1);
    expect(reports[0].zoneId).toBe("zone-1");
  });

  it("lets OutboxWriteFailed propagate rather than swallowing it", () => {
    // A caller that believes a report was queued when it was not is the
    // exact failure the outbox module exists to prevent — addWaterLevelReport
    // must not turn that into a silent no-op.
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    try {
      expect(() => addWaterLevelReport("zone-1", "knee")).toThrow(OutboxWriteFailed);
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("tries to drain the outbox right after queuing", () => {
    addWaterLevelReport("zone-1", "knee");
    expect(ensureAnonymousSession).toHaveBeenCalled();
  });

  it("drains and delivers a queued report once a session exists", async () => {
    // The end-to-end wiring: a session appearing is what turns "queued"
    // into "delivered" without waiting for a reload or an "online" event.
    ensureAnonymousSession.mockResolvedValueOnce("user-1");
    submitWaterLevelReport.mockResolvedValueOnce({ ok: true });

    addWaterLevelReport("zone-1", "knee");

    await vi.waitFor(() => expect(readOutbox()).toHaveLength(0));
    expect(submitWaterLevelReport).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: "zone-1", depthLevel: "knee" })
    );
  });

  it("still shows a queued report, and lets nothing throw, when /api/reports fails to fetch", async () => {
    // The brief's bolded requirement: a resident with no network still sees
    // their own queued reports, which is the whole point of the outbox. The
    // queued row is visible immediately from mergeReports regardless of
    // fetch, so the part actually at risk is the un-awaited fetch chain in
    // useServerReports: if its `.catch` let the rejection through instead of
    // swallowing it, nothing in the component tree would observe a
    // different render, but the rejection would go unhandled — so that is
    // what this asserts directly.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    addWaterLevelReport("zone-1", "knee");

    const unhandled: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      const { result } = renderHook(() => useWaterLevelReports());

      // Queued row is present from the first render, synchronously.
      expect(result.current).toHaveLength(1);
      expect(result.current[0].zoneId).toBe("zone-1");

      // Give the rejected fetch promise's microtask chain, and Node's
      // unhandled-rejection check (which runs after the current turn), time
      // to complete.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });
});
