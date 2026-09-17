"use client";

import { useEffect, useState } from "react";
import { onDelivered } from "./outbox/drain";
import { enqueue, useOutbox, visibleToCurrentUser } from "./outbox/outbox";
import { useSessionUserId } from "./auth/anonymous-session";
import { drainForCurrentSession } from "./outbox/session-drain";
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

function isReportEntry(entry: OutboxEntry): boolean {
  return entry.operation === "submitWaterLevelReport";
}

/**
 * The delivery refetch below deliberately carries a query parameter that
 * changes on every call; the mount fetch deliberately does not.
 *
 * `sw.js` serves a busted request on this path (any `/api/reports` request
 * carrying a query string) by going straight to the network and then storing
 * the fresh response under the PLAIN `/api/reports` key — the same key the
 * mount fetch reads. That is what makes the parameter's exact value
 * unimportant here: it only has to be present, to route this request to the
 * worker's network-only branch instead of staleWhileRevalidate, which would
 * otherwise answer from whichever copy — this session's or an earlier one's —
 * happens to be stored under that literal query string. See sw.js's
 * `revalidatePlainEntry` for the full reasoning, including why a growing or
 * random value would be the wrong fix.
 *
 * Because the worker itself now refreshes the plain cache entry as a side
 * effect of this one request, no separate warm-up request is needed
 * afterwards — the plain `/api/reports` entry the next mount reads is already
 * fresh the moment this call resolves.
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
 *
 * Filtered by operation, like community-pins.ts's own onDelivered listener.
 * Seven operations share one outbox, so an unfiltered subscription would
 * refetch /api/reports after delivering a pin, a vote or a check-in — a
 * refetch this store has no reason to make, since none of those deliveries
 * can have changed a water-level report (final-review.md F4).
 */
function useServerReports(): { rows: LiveWaterLevelReport[]; delivered: OutboxEntry[] } {
  const [rows, setRows] = useState<LiveWaterLevelReport[]>(NO_SERVER_ROWS);
  const [delivered, setDelivered] = useState<OutboxEntry[]>(NO_DELIVERED);

  // Subscribing signs nobody in: the drain this hears from is already gated
  // behind "something is queued", so a visitor who only reads never reaches
  // it. This cannot become a back door to an anonymous sign-in.
  useEffect(
    () =>
      onDelivered((entries) => {
        const mine = entries.filter(isReportEntry);
        if (mine.length > 0) setDelivered((held) => [...held, ...mine]);
      }),
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

  // One row per id, whatever the caller passed. `useWaterLevelReports` feeds
  // this the queue AND the delivered-but-not-yet-confirmed entries, and an id
  // can legitimately sit in both for a moment: `markDelivered`'s write to
  // local storage can fail silently (the store swallows storage errors), which
  // leaves the entry queued after it was already announced as delivered.
  // Without this the same report renders twice — and two rows for one report
  // is not a cosmetic duplicate, it is a second vote toward the agreeing-report
  // threshold that gates a zone's flood signal.
  const seen = new Set(serverIds);

  const optimistic: LiveWaterLevelReport[] = queued
    .filter(
      (entry) =>
        entry.operation === "submitWaterLevelReport" &&
        !serverIds.has(entry.id) &&
        // A stuck entry (RLS denial, CHECK/FK violation) will never be
        // delivered without a resident's explicit retry — drainOutbox skips
        // it forever. Rendering it as an ordinary live row would show it as
        // sent when it was rejected, and would silently and permanently
        // inflate the agreeing-report consensus count that gates a zone's
        // flood signal.
        entry.status !== "stuck"
    )
    .filter((entry) => {
      // Second pass rather than part of the predicate above: `seen` must only
      // grow for entries that actually produce a row.
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
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
  const currentUserId = useSessionUserId();
  // A held entry left behind by a different person on a shared phone (M13)
  // must not be drawn as this person's own optimistic report. `delivered`
  // needs no such filter: it only ever holds entries this session's own
  // drain just sent.
  return mergeReports(rows, [
    ...queued.filter((entry) => visibleToCurrentUser(entry, currentUserId)),
    ...delivered,
  ]);
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
 * Fire-and-forget attempt to flush the outbox right after a fresh
 * submission, so a resident who is online does not wait for a reload or an
 * "online" event (useOutboxDrain's job) to see their own report reach the
 * server. Signing in only happens here because there is something queued to
 * attribute — see drainForCurrentSession's own guard.
 *
 * Drains through dispatchQueued (dispatchers.ts), which now sends every
 * operation through one route-checked endpoint rather than dynamically
 * importing this file's own Server Action: a resident with a queued pin and
 * no signal who then files a report would otherwise flush only the report
 * and leave the pin sitting there. One queue, one dispatcher.
 */
function triggerDrain(): void {
  // Sends only this session's own writes, and signs in only for a write
  // queued with no identity yet. See drainForCurrentSession (I2).
  drainForCurrentSession();
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
