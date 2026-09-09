"use client";

import { useEffect, useState } from "react";
import { flushOutbox, onDelivered, PermanentFailure } from "./outbox/drain";
import { enqueue, useOutbox } from "./outbox/outbox";
import { ensureAnonymousSession } from "./auth/anonymous-session";
import type { OutboxEntry, OutboxPayloads } from "./outbox/types";
import type { DepthLevel } from "./depth";

export interface LiveWaterLevelReport {
  id: string;
  zoneId: string;
  depthLevel: DepthLevel;
  /** Absolute timestamp rather than a static "minutes ago" — see minutesSinceReport. */
  reportedAt: string;
  /** PRD Anti-Abuse layer 6: 1.0 is an unproven device, higher is one with a track record. */
  trustWeight: number;
  isOutlier: boolean;
  /** The authenticated (anonymous) user who filed this — see anonymous-session.ts. */
  reporterId: string;
}

const NO_SERVER_ROWS: LiveWaterLevelReport[] = [];
const NO_DELIVERED: OutboxEntry[] = [];

/**
 * The delivery refetch below deliberately carries a unique query parameter;
 * the mount fetch deliberately does not.
 *
 * `sw.js` serves `/api/reports` with staleWhileRevalidate — it answers from
 * the copy cached on a previous load and refreshes behind that. Right for the
 * mount fetch: a resident with no network still gets the neighbours' last
 * known reports. Wrong for the refetch that follows a delivery, because the
 * row it is fetching FOR is the one row the cached copy is guaranteed not to
 * contain, so a cached answer would withdraw the resident's own just-delivered
 * report from the screen — exactly what this refetch exists to prevent. The
 * parameter keeps the pathname (so sw.js's public-API allowlist still matches)
 * but misses the cache entry, so this one request reaches the network.
 */
function reportsUrl(afterDeliveries: number): string {
  return afterDeliveries === 0 ? "/api/reports" : `/api/reports?delivered=${afterDeliveries}`;
}

/**
 * The server's rows for `/api/reports` — fetched on mount, and again after any
 * drain that actually delivered something — plus the entries that drain
 * delivered, held until their real rows arrive.
 *
 * Both halves exist for one failure. `markDelivered` drops the entry from the
 * outbox the moment the server confirms it, which withdraws the optimistic row
 * `mergeReports` was rendering. Without the refetch the resident's own report
 * is gone for good, a second after they filed it, next to a green tick telling
 * them it worked — success looking identical to loss. Without the held
 * entries it is gone only until the refetch lands, which on the connection
 * this app assumes is still long enough to read "No reports from this zone
 * yet" beside "Report recorded".
 *
 * A held entry needs no expiry: `mergeReports` drops it as soon as a server
 * row carries its id, which is exactly what the refetch is fetching.
 *
 * The refetch fires on delivery only — never on render, never on a drain that
 * delivered nothing — so an offline or idle resident costs no requests.
 *
 * A failed fetch must never throw or blank the list: a resident with no
 * network still sees their own queued reports (via mergeReports below),
 * which is the entire point of the outbox. So a failure here just leaves
 * `rows` at whatever it already held (empty, on a first failed load).
 */
function useServerReports(): { rows: LiveWaterLevelReport[]; delivered: OutboxEntry[] } {
  const [rows, setRows] = useState<LiveWaterLevelReport[]>(NO_SERVER_ROWS);
  const [delivered, setDelivered] = useState<OutboxEntry[]>(NO_DELIVERED);

  // Subscribing signs nobody in: the drain this hears from is already gated
  // behind "something is queued", so a visitor who only reads never reaches
  // it. This cannot become a back door to an anonymous sign-in.
  useEffect(
    () => onDelivered((entries) => setDelivered((held) => [...held, ...entries])),
    []
  );

  // `delivered` is the dependency rather than a render-time value: its
  // identity changes when, and only when, a drain delivered something.
  useEffect(() => {
    let cancelled = false;

    fetch(reportsUrl(delivered.length))
      .then((response) =>
        response.ok
          ? (response.json() as Promise<LiveWaterLevelReport[]>)
          : Promise.reject(new Error(`/api/reports responded ${response.status}`))
      )
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        // Offline, timed out, or a 5xx — degrade, don't fail. Whatever rows
        // this hook already had (queued reports still come through the
        // outbox regardless) stay on screen.
      });

    return () => {
      cancelled = true;
    };
  }, [delivered]);

  return { rows, delivered };
}

/**
 * Appends queued-but-unconfirmed reports as optimistic rows, skipping any
 * whose id already appears among the server rows.
 *
 * The optimistic row and the eventual server row share an id — `enqueue`
 * generates it and the Server Action inserts it as the primary key — so this
 * dedup is exact rather than heuristic: once the server row lands, it
 * replaces the optimistic one instead of appearing beside it as a duplicate.
 */
export function mergeReports(
  serverRows: LiveWaterLevelReport[],
  queued: OutboxEntry[]
): LiveWaterLevelReport[] {
  const serverIds = new Set(serverRows.map((row) => row.id));

  const optimistic: LiveWaterLevelReport[] = queued
    .filter(
      (entry) =>
        entry.operation === "submitWaterLevelReport" &&
        !serverIds.has(entry.id) &&
        // A permanently-failed entry (RLS denial, CHECK/FK violation) will
        // never be delivered — drainOutbox skips it forever. Rendering it as
        // an ordinary live row would show it as sent when it was rejected,
        // and would silently and permanently inflate the agreeing-report
        // consensus count that gates a zone's flood signal.
        !entry.permanentlyFailed
    )
    .map((entry) => {
      const payload = entry.payload as OutboxPayloads["submitWaterLevelReport"];
      return {
        id: entry.id,
        zoneId: payload.zoneId,
        depthLevel: payload.depthLevel,
        reportedAt: entry.queuedAt,
        // Same starting values addWaterLevelReport always used: reputation
        // scoring and outlier detection are Final Phase.
        trustWeight: 1.0,
        isOutlier: false,
        // Not yet known: attribution happens at replay (see
        // useOutboxDrain), not at queue time. "pending" is never shown —
        // no consumer of LiveWaterLevelReport reads reporterId today.
        reporterId: "pending",
      };
    });

  return [...serverRows, ...optimistic];
}

/**
 * Every live water-level report: confirmed server rows, plus anything still
 * queued, plus anything delivered whose server row has not come back yet.
 *
 * Delivered entries go through the same merge as queued ones because they need
 * the same rule — render optimistically, and stand down the moment a server row
 * carries the id.
 */
export function useWaterLevelReports(): LiveWaterLevelReport[] {
  const { rows, delivered } = useServerReports();
  const queued = useOutbox();
  return mergeReports(rows, [...queued, ...delivered]);
}

/** Newest first, matching the previous mock-data helper's ordering contract. */
export function getRecentReportsForZoneLive(
  reports: LiveWaterLevelReport[],
  zoneId: string
): LiveWaterLevelReport[] {
  return reports
    .filter((report) => report.zoneId === zoneId)
    .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
}

/**
 * Replays one queued write. Thrown errors are what tell drainOutbox whether
 * to retry.
 *
 * The Server Action is imported dynamically, not at module scope: it pulls
 * in user-server.ts's `import "server-only"` transitively, and water-level-
 * reports.ts is imported by every component that only reads the report list
 * (TimeAgo, RecentReportsPanel, FloodMonitoringPanel). A static import would
 * make evaluating this module fail server-only's guard for every one of
 * them; a dynamic import here means that code only ever loads at the moment
 * a queued write is actually being dispatched.
 */
export async function dispatchQueuedReport(entry: OutboxEntry): Promise<void> {
  const { submitWaterLevelReport } = await import("@/app/actions/submit-water-level-report");
  const payload = entry.payload as OutboxPayloads["submitWaterLevelReport"];
  const result = await submitWaterLevelReport({ id: entry.id, ...payload });
  if (result.ok) return;
  throw result.permanent ? new PermanentFailure(result.error) : new Error(result.error);
}

/**
 * Fire-and-forget attempt to flush the outbox right after a fresh
 * submission, so a resident who is online does not wait for a reload or an
 * "online" event (useOutboxDrain's job) to see their own report reach the
 * server. Signing in only happens here because there is something queued to
 * attribute — see Task 2 Step 6 / useOutboxDrain's own guard.
 */
function triggerDrain(): void {
  void ensureAnonymousSession().then((userId) => {
    // flushOutbox, not drainOutbox: this is the call most likely to be
    // declined, because the resident tapping "Report again" during a flood is
    // filing while the previous report's drain is still on the wire. A
    // declined drain that nobody re-runs is a report that never leaves the
    // device while the app is open.
    if (userId) void flushOutbox(dispatchQueuedReport);
  });
}

/**
 * Queues a resident's report and asks the outbox to try to send it right
 * away. Stays void-returning so its call sites do not change — but `enqueue`
 * can throw `OutboxWriteFailed` when the queue itself did not persist (local
 * storage full or blocked), and that is left to propagate: a caller that
 * believes a report was queued when it was not is exactly the failure the
 * outbox module exists to prevent.
 */
export function addWaterLevelReport(zoneId: string, depthLevel: DepthLevel): void {
  enqueue("submitWaterLevelReport", { zoneId, depthLevel });
  triggerDrain();
}

export function minutesSinceReport(reportedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(reportedAt).getTime()) / 60000));
}
