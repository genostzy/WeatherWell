import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const ensureAnonymousSession = vi.fn().mockResolvedValue(null);

// submit-water-level-report.ts pulls in user-server.ts, which does
// `import "server-only"` — that throws unconditionally outside a real
// server bundler. water-level-reports.ts no longer reaches it at all: every
// write now drains through dispatchQueued (dispatchers.ts), which sends
// operations through /api/outbox/<operation> (Task 4) rather than a
// dynamically imported Server Action, so nothing here needs to stub that
// module any more — only `fetch`, for the one test that drains for real.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: () => ensureAnonymousSession(),
  // No session: every entry in this file is queued with userId null.
  useSessionUserId: () => null,
}));

import {
  addWaterLevelReport,
  getRecentReportsForZoneLive,
  minutesSinceReport,
  mergeReports,
  useWaterLevelReports,
} from "./water-level-reports";
import { readOutbox, enqueue, applyEntryOutcome, OutboxWriteFailed } from "@/lib/outbox/outbox";
import { drainOutbox } from "@/lib/outbox/drain";
import { rememberSessionUserId } from "@/lib/auth/session-user";

function serverRowFor(id: string) {
  return {
    id,
    zoneId: "zone-1",
    depthLevel: "knee" as const,
    reportedAt: new Date().toISOString(),
    // The one field that tells a real server row apart from an optimistic
    // one: trust weight is server-controlled, and a queued row always starts
    // at 1.0. (reporterId used to play this part; it is no longer public.)
    trustWeight: 2,
    isOutlier: false,
  };
}

/** No server rows in this file — every case here is about the outbox side of the merge. */
function currentReports() {
  return mergeReports([], readOutbox());
}

describe("water-level-reports", () => {
  beforeEach(() => {
    localStorage.clear();
    ensureAnonymousSession.mockClear();
    // session-user.ts keeps the last identity a drain saw in module state; a
    // test that signs in must not stamp the next test's writes with its id.
    rememberSessionUserId(null);
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

  it("carries the device's position into the queued payload when given", () => {
    addWaterLevelReport("zone-1", "knee", { lat: 16.0, lng: 120.436 });

    const [pending] = readOutbox();
    expect(pending.payload).toEqual({ zoneId: "zone-1", depthLevel: "knee", lat: 16.0, lng: 120.436 });
  });

  it("queues no lat/lng keys at all when no position is given — never blocks on a missing GPS fix", () => {
    addWaterLevelReport("zone-1", "knee", null);

    const [pending] = readOutbox();
    expect(pending.payload).toEqual({ zoneId: "zone-1", depthLevel: "knee" });
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
    // violation) must stop voting: drainOutbox skips a stuck entry forever
    // (without an explicit retry), so if mergeReports kept rendering it, it
    // would count toward the agreeing-report consensus threshold forever too.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    applyEntryOutcome(entry.id, { result: "permanent", reason: "new row violates row-level security policy" });

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
    // Goes through the real dispatchQueued → sendEntry → fetch chain now
    // (Task 4); only the wire itself is stubbed.
    ensureAnonymousSession.mockResolvedValueOnce("user-1");
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ status: 200, json: () => Promise.resolve({ result: "delivered" }) });
    vi.stubGlobal("fetch", fetchMock);

    addWaterLevelReport("zone-1", "knee");

    await vi.waitFor(() => expect(readOutbox()).toHaveLength(0));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/outbox/submitWaterLevelReport",
      expect.objectContaining({ method: "POST" })
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string).payload).toEqual({ zoneId: "zone-1", depthLevel: "knee" });
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

  it("keeps a delivered report on screen, then replaces it with its server row", async () => {
    // The failure this guards: markDelivered drops the entry the moment the
    // server confirms it, withdrawing the optimistic row — and /api/reports was
    // only ever fetched on mount, so nothing replaced it. The resident watched
    // their own report vanish beside a green tick saying "Report recorded".
    // Success looked identical to loss, and the agreeing count that gates the
    // auto-trigger threshold dropped with it.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    // The refetch is held open deliberately. Letting it resolve inside the
    // same act() would make the assertion below pass whether or not the
    // delivered row is held on screen — the refetch is a round trip on a bad
    // connection, and this test is about what the resident sees during it.
    let respond!: (rows: unknown[]) => void;
    const heldRefetch = new Promise((resolve) => {
      respond = (rows) => resolve({ ok: true, json: async () => rows });
    });

    const fetchMock = vi
      .fn()
      // On mount the row does not exist server-side yet.
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockReturnValueOnce(heldRefetch);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useWaterLevelReports());

    expect(result.current).toHaveLength(1);
    expect(result.current[0].trustWeight).toBe(1);

    await act(async () => {
      await drainOutbox(async () => ({ result: "delivered" }));
    });

    // Delivered: out of the outbox, refetch on the wire — and still on screen.
    expect(readOutbox()).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current).toHaveLength(1);

    // And then the real row takes its place — once, not twice.
    await act(async () => {
      respond([serverRowFor(entry.id)]);
      await heldRefetch;
    });
    await vi.waitFor(() => expect(result.current[0].trustWeight).toBe(2));
    expect(result.current).toHaveLength(1);
  });

  it("does not refetch when a drain delivered nothing", async () => {
    // The refetch is spent on a resident's behalf. An offline pass that
    // delivered nothing has nothing new to fetch.
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useWaterLevelReports());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await drainOutbox(async () => ({ result: "retry", error: "offline" }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not refetch /api/reports when a delivery contains no water-level report (F4)", async () => {
    // Seven operations share one outbox. Before this fix, useServerReports'
    // onDelivered listener was not filtered by operation, so delivering a
    // pin, a vote, or a check-in also refetched /api/reports — a request
    // this store has no reason to make, since none of those writes can have
    // changed a water-level report.
    enqueue("createPin", {
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Knee-deep",
      lat: 16.06,
      lng: 120.4,
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useWaterLevelReports());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      // Resolves for every entry, so the queued pin write is "delivered".
      await drainOutbox(async () => ({ result: "delivered" }));
    });

    // Give any microtask this delivery might have queued a turn to run.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not let the service worker's cached copy answer the post-delivery refetch", async () => {
    // sw.js serves /api/reports with staleWhileRevalidate — `cached || network`
    // — so a plain refetch would be answered from the copy captured on the
    // previous load: the one copy guaranteed not to contain the row this
    // refetch exists to collect. The mount fetch stays plain (that cache is
    // what a resident with no network reads); this one must miss it while
    // keeping the pathname sw.js's public-API allowlist matches on.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValue({ ok: true, json: async () => [serverRowFor(entry.id)] });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useWaterLevelReports());
    await act(async () => {
      await drainOutbox(async () => ({ result: "delivered" }));
    });
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));

    const mountUrl = String(fetchMock.mock.calls[0][0]);
    const refetchUrl = String(fetchMock.mock.calls[1][0]);

    expect(mountUrl).toBe("/api/reports");
    expect(refetchUrl).not.toBe(mountUrl);
    expect(new URL(refetchUrl, "https://weatherwell.test").pathname).toBe("/api/reports");
  });

  // "warms the plain cache entry the next load will read" used to live here,
  // covering water-level-reports.ts's own refreshCachedReports warm-up
  // request. final-review.md F2's fix moved that job into the service worker
  // itself: sw.js's revalidatePlainEntry now stores the busted refetch's
  // fresh response under the PLAIN `/api/reports` key as a side effect of
  // that ONE request, which made the second, separate warm-up request
  // redundant — so it was removed from this store. The same guarantee is
  // covered against the real worker now: see
  // src/lib/service-worker.test.ts's "stores a post-write refetch's fresh
  // response under the PLAIN url, not the busted one (F2)".

  it("renders one row when an id is both queued and delivered", async () => {
    // markDelivered writes to local storage and the store swallows storage
    // errors, so an entry can stay queued after it was announced as
    // delivered. useWaterLevelReports feeds mergeReports both lists, and two
    // rows for one report is not a cosmetic duplicate — it is a second vote
    // toward the agreeing-report threshold that gates a zone's flood signal.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    expect(mergeReports([], [entry, entry])).toHaveLength(1);
  });
});
