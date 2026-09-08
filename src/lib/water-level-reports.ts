"use client";

import { useEffect, useState } from "react";
import { drainOutbox, PermanentFailure } from "./outbox/drain";
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

/**
 * The server's rows for `/api/reports`, refetched on every mount.
 *
 * A failed fetch must never throw or blank the list: a resident with no
 * network still sees their own queued reports (via mergeReports below),
 * which is the entire point of the outbox. So a failure here just leaves
 * `rows` at whatever it already held (empty, on a first failed load).
 */
function useServerReports(): LiveWaterLevelReport[] {
  const [rows, setRows] = useState<LiveWaterLevelReport[]>(NO_SERVER_ROWS);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/reports")
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
  }, []);

  return rows;
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

/** Every live water-level report: confirmed server rows plus anything still queued. */
export function useWaterLevelReports(): LiveWaterLevelReport[] {
  const serverRows = useServerReports();
  const queued = useOutbox();
  return mergeReports(serverRows, queued);
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
    if (userId) void drainOutbox(dispatchQueuedReport);
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
