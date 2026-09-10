"use client";

import { useEffect, useState } from "react";
import { flushOutbox, onDelivered, PermanentFailure } from "./outbox/drain";
import { enqueue, useOutbox } from "./outbox/outbox";
import { dispatchQueued, payloadOf } from "./outbox/dispatchers";
import { ensureAnonymousSession, useSessionUserId } from "./auth/anonymous-session";
import type { CheckInStatus } from "./types";
import type { OutboxEntry, OutboxPayloads } from "./outbox/types";

/**
 * Now defined in ./types.ts — outbox/types.ts needs it, and importing it
 * back from here would be circular since this file imports OutboxEntry from
 * that very module. Re-exported so existing importers do not change.
 */
export type { CheckInStatus };

export interface EvacuationCheckIn {
  id: string;
  zoneId: string;
  /**
   * The authenticated (anonymous) user who filed this — issued and verified
   * by the server, replacing the old random device id. Same move
   * CommunityPin.authorId made.
   */
  userId: string;
  status: CheckInStatus;
  checkedInAt: string;
}

/**
 * The userId a queued-but-not-yet-delivered check-in carries. Attribution
 * happens at replay (see dispatchQueuedCheckIn below), not at queue time — a
 * resident with no signal has no uid yet — so there is genuinely nothing to
 * put here. It is never displayed; getOwnCheckInForZone is its only reader.
 */
const PENDING_USER_ID = "pending";

const NO_SERVER_ROWS: EvacuationCheckIn[] = [];
const NO_DELIVERED: OutboxEntry[] = [];

function isCheckInEntry(entry: OutboxEntry): boolean {
  return entry.operation === "recordCheckIn";
}

/**
 * The server's rows for `/api/check-ins` — fetched on mount, and again after
 * any drain that delivered a check-in — plus the entries that drain
 * delivered, held until their real rows arrive.
 *
 * Same two-part shape `useServerReports` and `useServerPins` use, guarding
 * against the same failure: `markDelivered` drops the entry the moment the
 * server confirms it, withdrawing the optimistic row `mergeCheckIns` was
 * drawing. Without the refetch a resident who just tapped "I'm safe" would
 * watch their own confirmation vanish a second later — the one response in
 * this app where that would matter most.
 *
 * Unlike the reports and pins hooks, there is no cache-busting query
 * parameter here and no cache-warming follow-up request. Both exist over
 * there to route around `sw.js`'s staleWhileRevalidate cache for
 * `/api/reports` and `/api/pins`. `/api/check-ins` is never put in that
 * cache in the first place — `sw.js` carries a dedicated branch that sends
 * it straight to the network, always — so there is no stale entry to dodge
 * and nothing for a warm-up request to refresh.
 */
function useServerCheckIns(): { rows: EvacuationCheckIn[]; delivered: OutboxEntry[] } {
  const [rows, setRows] = useState<EvacuationCheckIn[]>(NO_SERVER_ROWS);
  const [delivered, setDelivered] = useState<OutboxEntry[]>(NO_DELIVERED);

  // Subscribing signs nobody in: the drain this hears from is already gated
  // behind "something is queued", so a visitor who only reads never reaches
  // it. This cannot become a back door to an anonymous sign-in.
  useEffect(
    () =>
      onDelivered((entries) => {
        const mine = entries.filter(isCheckInEntry);
        if (mine.length > 0) setDelivered((held) => [...held, ...mine]);
      }),
    []
  );

  // `delivered` is the dependency rather than a render-time value: its
  // identity changes when, and only when, a drain delivered a check-in, and
  // that is when a fresh read is worth another request.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/check-ins")
      .then((response) =>
        response.ok
          ? (response.json() as Promise<EvacuationCheckIn[]>)
          : Promise.reject(new Error(`/api/check-ins responded ${response.status}`))
      )
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch(() => {
        // Offline, timed out, or a 5xx — degrade, don't fail. Whatever rows
        // this hook already had stay on screen, and a queued check-in still
        // comes through the outbox regardless.
      });

    return () => {
      cancelled = true;
    };
  }, [delivered]);

  return { rows, delivered };
}

/**
 * Server rows with this device's queued check-in laid over them.
 *
 * Reconciled by (zone, caller uid), not by id — unlike every other merge in
 * this app. `mergePins` and `mergeReports` can match a queued entry to its
 * eventual server row because both carry the same id: the outbox generates
 * it and the Server Action inserts it as the primary key. A check-in's
 * conflict target is `(zone_id, user_id)`, not `id` (see `recordCheckIn`'s
 * upsert), and a queued entry has no `userId` yet — attribution happens at
 * replay. So `id` is not available either; the zone plus the caller's own
 * uid (passed in, not read from a hook — see the constraint on `mergeCheckIns`
 * staying pure) is what a queued entry is matched against instead.
 *
 * `callerUserId` is this device's own uid, from `useSessionUserId` — never
 * a hook call inside this function itself, so it stays a plain function
 * usable in a loop. A queued entry only ever supersedes a server row that
 * belongs to *this* caller for that zone; a neighbour's row (visible to an
 * operator, whose `serverRows` span every resident in the zone) is never a
 * candidate, because the id check above binds the drop to `row.userId`, not
 * just `row.zoneId`. This is what makes `useEvacuationCheckIns` safe for
 * `CheckInSummaryPanel` too, not only the resident's own `CheckInPanel`: an
 * operator's own pending check-in can no longer wipe out every other
 * resident's row in the zone's headcount.
 *
 * A resident who tapped "safe" and then "needs help" before either reached
 * the server has two entries queued for the same zone; the later one wins,
 * matching every other store's "the last queued write for a given target is
 * what shows".
 */
export function mergeCheckIns(
  serverRows: EvacuationCheckIn[],
  queued: OutboxEntry[],
  callerUserId: string | null
): EvacuationCheckIn[] {
  const latestByZone = new Map<
    string,
    { entry: OutboxEntry; payload: OutboxPayloads["recordCheckIn"] }
  >();

  for (const entry of queued) {
    // A permanently-failed entry (RLS denial, CHECK violation) will never be
    // delivered — drainOutbox skips it forever. Showing it as an ordinary
    // check-in would tell a resident their refused answer went through.
    if (entry.permanentlyFailed) continue;
    const payload = payloadOf(entry, "recordCheckIn");
    if (!payload) continue;
    // Map insertion order is queue order, so the last write for a zone wins.
    latestByZone.set(payload.zoneId, { entry, payload });
  }

  // Only the caller's own row for a zone that has a queued answer is
  // dropped — never a neighbour's, and (explicit, not incidental — see the
  // callerUserId === null branch) never anyone's when this device has no
  // session yet: a resident who has not signed in has no server row of
  // their own to replace, so the queued entry below is appended instead of
  // displacing a row it cannot possibly own.
  const rows = serverRows.filter((row) => {
    if (!latestByZone.has(row.zoneId)) return true;
    if (callerUserId === null) return true;
    return row.userId !== callerUserId;
  });

  const optimistic: EvacuationCheckIn[] = [...latestByZone.entries()].map(
    ([zoneId, { entry, payload }]) => ({
      id: entry.id,
      zoneId,
      userId: PENDING_USER_ID,
      status: payload.status,
      checkedInAt: entry.queuedAt,
    })
  );

  return [...rows, ...optimistic];
}

/**
 * Every check-in this caller can see, live — a resident's own, an operator's
 * zone. Call once per component and filter the returned array — never call
 * this hook inside a loop.
 *
 * `useSessionUserId` here is the same read-only, sign-nobody-in hook
 * `CheckInPanel` already calls for `getOwnCheckInForZone` — it reads an
 * existing session only, so mounting this hook (including from
 * `CheckInSummaryPanel`, which never writes) still never reaches
 * `ensureAnonymousSession`.
 */
export function useEvacuationCheckIns(): EvacuationCheckIn[] {
  const { rows, delivered } = useServerCheckIns();
  const queued = useOutbox();
  const callerUserId = useSessionUserId();
  return mergeCheckIns(rows, [...queued, ...delivered], callerUserId);
}

export function getCheckInsForZone(checkIns: EvacuationCheckIn[], zoneId: string): EvacuationCheckIn[] {
  return checkIns.filter((checkIn) => checkIn.zoneId === zoneId);
}

/**
 * This resident's own check-in for a zone, if any — lets the resident UI show
 * a confirmation instead of the buttons again.
 *
 * A check-in still queued on this device has no real userId yet (see
 * PENDING_USER_ID above) and is claimed unconditionally: the outbox only
 * ever holds writes made on this device, so it is this resident's own by
 * construction — the same reasoning `isOwnPin` uses for a pending pin.
 */
export function getOwnCheckInForZone(
  checkIns: EvacuationCheckIn[],
  zoneId: string,
  userId: string | null
): EvacuationCheckIn | undefined {
  return checkIns.find(
    (checkIn) =>
      checkIn.zoneId === zoneId && (checkIn.userId === PENDING_USER_ID || checkIn.userId === userId)
  );
}

/**
 * Fire-and-forget attempt to flush the outbox right after a check-in, so a
 * resident who is online does not wait for a reload or an "online" event to
 * see their answer reach the server. Signing in only happens here because
 * there is now something queued to attribute.
 *
 * Drains through dispatchQueued, not dispatchQueuedCheckIn directly: one
 * queue, one dispatcher — a resident with a queued pin and no signal who
 * then checks in must not flush only the check-in.
 */
function triggerDrain(): void {
  void ensureAnonymousSession().then((userId) => {
    if (userId) void flushOutbox(dispatchQueued);
  });
}

/**
 * Records (or replaces) this resident's check-in for a zone. Queued like
 * every other write in this app — a resident can change "I'm safe" to "I
 * need help" later, so this isn't append-only, and `mergeCheckIns`'s
 * zone-keyed replacement is what shows the newer answer at once, before
 * either write has reached the server.
 *
 * Stays void-returning so its call site does not change — but `enqueue` can
 * throw `OutboxWriteFailed` when the queue itself did not persist (local
 * storage full or blocked), and that is left to propagate: a caller that
 * believes a check-in was queued when it was not is exactly the failure the
 * outbox exists to prevent, and for this write more than any other — see the
 * module doc at the top of `record-check-in.ts`.
 */
export function recordCheckIn(zoneId: string, status: CheckInStatus): void {
  enqueue("recordCheckIn", { zoneId, status });
  triggerDrain();
}

/**
 * Replays one queued check-in. Thrown errors are what tell drainOutbox
 * whether to retry.
 *
 * Imported dynamically, not at module scope, for the same reason every other
 * dispatcher in this app is: the Server Action pulls in user-server.ts's
 * `import "server-only"` transitively, and this file is imported by every
 * component that only READS check-ins (CheckInPanel, CheckInSummaryPanel). A
 * static import would make evaluating this module fail server-only's guard
 * for both of them.
 */
export async function dispatchQueuedCheckIn(entry: OutboxEntry): Promise<void> {
  const payload = payloadOf(entry, "recordCheckIn");
  if (!payload) {
    // dispatchers.ts routes exactly one operation here. An entry that is not
    // a check-in reaching this function is a routing bug, and it must fail
    // loudly rather than silently drop the write.
    throw new Error(`Check-in dispatcher received an entry it does not handle (${entry.operation})`);
  }

  const { recordCheckIn: recordCheckInAction } = await import("@/app/actions/record-check-in");
  const result = await recordCheckInAction({ id: entry.id, zoneId: payload.zoneId, status: payload.status });
  if (result.ok) return;
  throw result.permanent ? new PermanentFailure(result.error) : new Error(result.error);
}
