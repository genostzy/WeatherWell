"use client";

import { useEffect, useState } from "react";
import { onDelivered, PermanentFailure } from "./outbox/drain";
import { enqueue, readOutbox, useOutbox } from "./outbox/outbox";
import { payloadOf } from "./outbox/dispatchers";
import { drainForCurrentSession } from "./outbox/session-drain";
import type { PinStatusTag, PinRemovalReason } from "./community-pin";
import type { OutboxEntry, OutboxOperation } from "./outbox/types";

/**
 * The author id an optimistic pin carries until its real row comes back.
 *
 * Attribution happens at replay (see useOutboxDrain), not at queue time — a
 * resident with no signal has no uid yet — so there is genuinely nothing to
 * put here. It is never displayed; `isOwnPin` is its only reader.
 */
export const PENDING_AUTHOR_ID = "pending";

/** The four operations in the shared queue that this store owns. */
const PIN_OPERATIONS: OutboxOperation[] = ["createPin", "editPin", "deleteOwnPin", "setPinRemoved"];

export interface CommunityPin {
  id: string;
  zoneId: string;
  statusTag: PinStatusTag;
  /** Free text typed by the resident — never auto-translated, unlike the app's own LocalizedText copy. */
  caption: string;
  /**
   * Kept on the interface, never written by this store. Photo upload has no
   * server side yet: `photo_path` was revoked from the resident's insert
   * grant, and there is no bucket behind it. A pin created today has no
   * photo, and the viewers (map popup, lightbox) already handle its absence.
   */
  photoDataUrl?: string;
  lat: number;
  lng: number;
  upvotes: number;
  downvotes: number;
  /** This caller's own vote, from pin_votes. Replaces the old local votes store. */
  ownVote?: 1 | -1;
  createdAt: string;
  /**
   * The authenticated (anonymous) user who dropped this pin — issued and
   * verified by the server, which is what anti-abuse layer 5 always claimed
   * and the old random device id could not deliver.
   */
  authorId: string;
  /**
   * Soft-delete, not a filter-out: PRD says admin can "remove or restore any
   * pin" — a net-score removal is a fast automated response, not final,
   * exactly like the alert pipeline's own Human Override. It is also not a
   * choice: DELETE is revoked from every role on every table, so removal is
   * the only removal there is. Removed pins stay in the database, just hidden
   * from the public map (see useCommunityPins).
   */
  removed?: boolean;
  /** Undefined on a removed pin means its own author withdrew it — see PinRemovalReason. */
  removedReason?: PinRemovalReason;
}

const NO_SERVER_ROWS: CommunityPin[] = [];
const NO_DELIVERED: OutboxEntry[] = [];

/**
 * The delivery refetch carries a unique query parameter; the mount fetch
 * deliberately does not. Same reasoning as `/api/reports`, which
 * water-level-reports.ts sets out at length: sw.js serves this path with
 * staleWhileRevalidate, which is right for the mount fetch (a resident with no
 * network still sees the neighbours' pins) and wrong for the refetch that
 * follows a delivery, because the row it is fetching FOR is the one row the
 * cached copy cannot contain. The parameter keeps the pathname, so sw.js's
 * allowlist still matches, but misses the cache entry.
 */
function pinsUrl(afterDeliveries: number): string {
  return afterDeliveries === 0 ? "/api/pins" : `/api/pins?delivered=${afterDeliveries}`;
}

/**
 * Warms the cache entry the NEXT mount will read.
 *
 * The busted URL above stores its fresh copy under `?delivered=1`, a key
 * nothing reads again, leaving the plain `/api/pins` entry — the one the next
 * mount hits — holding the pre-delivery body. Without this the resident closes
 * the app, reopens it, and their own pin is missing from the map: the busting
 * parameter guaranteeing the staleness it was introduced to route around.
 *
 * The response is discarded on purpose; this call is for its side effect on
 * the cache. It fails silently for the same reason the fetch above does.
 */
function refreshCachedPins(): void {
  void fetch("/api/pins").catch(() => undefined);
}

function isPinEntry(entry: OutboxEntry): boolean {
  return PIN_OPERATIONS.includes(entry.operation) || entry.operation === "voteOnPin";
}

/**
 * The server's rows for `/api/pins` — fetched on mount, and again after any
 * drain that delivered a pin write — plus the entries that drain delivered,
 * held until their real rows arrive.
 *
 * Both halves exist for one failure, the same one `useServerReports`
 * documents: `markDelivered` drops the entry the moment the server confirms
 * it, withdrawing the optimistic pin that `mergePins` was drawing. Without the
 * refetch the resident's own pin is gone for good a second after they placed
 * it; without the held entries it is gone only until the refetch lands, which
 * on the connection this app assumes is long enough to watch a marker vanish
 * off the map.
 *
 * A held entry needs no expiry: `mergePins` drops it as soon as a server row
 * carries its id, which is exactly what the refetch is fetching.
 *
 * Unlike the reports hook, this one filters the delivery notification by
 * operation. Seven operations share one queue, so an undelivered notification
 * for a check-in or a water-level report would otherwise spend a resident's
 * bandwidth refetching pins that cannot have changed.
 *
 * A failed fetch must never throw or blank the map: a resident with no network
 * still sees their own queued pins (via mergePins), which is the entire point
 * of the outbox. So a failure here leaves `rows` at whatever it already held.
 */
function useServerPins(): { rows: CommunityPin[]; delivered: OutboxEntry[] } {
  const [rows, setRows] = useState<CommunityPin[]>(NO_SERVER_ROWS);
  const [delivered, setDelivered] = useState<OutboxEntry[]>(NO_DELIVERED);

  // Subscribing signs nobody in: the drain this hears from is already gated
  // behind "something is queued", so a visitor who only reads never reaches
  // it. This cannot become a back door to an anonymous sign-in.
  useEffect(
    () =>
      onDelivered((entries) => {
        const mine = entries.filter(isPinEntry);
        if (mine.length > 0) setDelivered((held) => [...held, ...mine]);
      }),
    []
  );

  // `delivered` is the dependency rather than a render-time value: its
  // identity changes when, and only when, a drain delivered a pin write.
  useEffect(() => {
    let cancelled = false;

    fetch(pinsUrl(delivered.length))
      .then((response) =>
        response.ok
          ? (response.json() as Promise<CommunityPin[]>)
          : Promise.reject(new Error(`/api/pins responded ${response.status}`))
      )
      .then((data) => {
        if (!cancelled) setRows(data);
        // Only after a delivery: the mount fetch IS the plain request, so
        // doing this there would be a second copy of the same call.
        if (delivered.length > 0) refreshCachedPins();
      })
      .catch(() => {
        // Offline, timed out, or a 5xx — degrade, don't fail. Whatever rows
        // this hook already had stay on screen, and queued pins still come
        // through the outbox regardless.
      });

    return () => {
      cancelled = true;
    };
  }, [delivered]);

  return { rows, delivered };
}

/**
 * Server rows with this device's queued writes laid over them.
 *
 * A queued create appears as a pin at once; a queued edit rewrites the row it
 * names; a queued delete hides it; a queued moderation write flips its removed
 * flag; a queued vote counts. The resident sees the map they just acted on,
 * whether or not any of it has reached the server.
 *
 * The optimistic pin and its eventual server row share an id — `enqueue`
 * generates it and `createPin` inserts it as the primary key — so reconciling
 * them is exact rather than heuristic: the server row replaces the optimistic
 * one instead of appearing beside it. Two markers on one spot is not a
 * cosmetic duplicate; it is the zone's pin count saying two people reported a
 * flooded road when one did.
 */
export function mergePins(serverRows: CommunityPin[], queued: OutboxEntry[]): CommunityPin[] {
  // Keyed by id, which dedupes server rows and optimistic ones in one step.
  const pins = new Map<string, CommunityPin>();
  for (const row of serverRows) pins.set(row.id, row);

  // A permanently-failed entry (RLS denial, CHECK/FK violation, a rejected
  // caption) will never be delivered — drainOutbox skips it forever. Drawing
  // it as an ordinary pin would show a rejected report as posted, on a map
  // whose entire purpose is telling people which roads are passable.
  const live = queued.filter((entry) => !entry.permanentlyFailed);

  for (const entry of live) {
    const payload = payloadOf(entry, "createPin");
    if (!payload) continue;
    // Already present means either the server row has arrived (it replaces
    // this) or the same entry was passed twice — useAllCommunityPins feeds
    // this the queue AND the delivered-but-unconfirmed entries, and an id can
    // legitimately sit in both for a moment, because markDelivered's write to
    // local storage can fail silently.
    if (pins.has(entry.id)) continue;
    pins.set(entry.id, {
      id: entry.id,
      zoneId: payload.zoneId,
      statusTag: payload.statusTag,
      caption: payload.caption,
      lat: payload.lat,
      lng: payload.lng,
      upvotes: 0,
      downvotes: 0,
      createdAt: entry.queuedAt,
      authorId: PENDING_AUTHOR_ID,
      removed: false,
    });
  }

  // Second pass, in queue order, so a resident who edited twice sees the
  // second edit and an operator who removed then restored sees it active.
  const withdrawn = new Set<string>();
  for (const entry of live) {
    const edit = payloadOf(entry, "editPin");
    if (edit) {
      const pin = pins.get(edit.pinId);
      if (pin) pins.set(edit.pinId, { ...pin, statusTag: edit.statusTag, caption: edit.caption });
      continue;
    }

    const deletion = payloadOf(entry, "deleteOwnPin");
    if (deletion) {
      withdrawn.add(deletion.pinId);
      continue;
    }

    const moderation = payloadOf(entry, "setPinRemoved");
    if (moderation) {
      const pin = pins.get(moderation.pinId);
      if (pin) {
        pins.set(moderation.pinId, {
          ...pin,
          removed: moderation.removed,
          removedReason: moderation.removed ? moderation.reason : undefined,
        });
      }
      continue;
    }

    const vote = payloadOf(entry, "voteOnPin");
    if (vote) {
      const pin = pins.get(vote.pinId);
      if (pin) {
        // The server row can already carry this caller's own vote in this
        // exact direction — the tally endpoint derives ownVote from
        // pin_votes, and a resident's queued vote lands on the server well
        // before its next refetch clears the entry from the outbox (see
        // useServerPins). Incrementing again on top of a server count that
        // already includes this vote would double it for the one resident
        // who cast it, on every load until the entry is cleared.
        const serverAlreadyCountsThisVote = pin.ownVote === vote.direction;
        pins.set(vote.pinId, {
          ...pin,
          upvotes: pin.upvotes + (!serverAlreadyCountsThisVote && vote.direction === 1 ? 1 : 0),
          downvotes: pin.downvotes + (!serverAlreadyCountsThisVote && vote.direction === -1 ? 1 : 0),
          ownVote: vote.direction,
        });
      }
    }
  }

  // Applied last so it beats any edit or vote queued behind it.
  for (const id of withdrawn) pins.delete(id);

  return [...pins.values()];
}

/** Every pin including removed ones — for admin moderation, where a removed pin must still be visible to restore. */
export function useAllCommunityPins(): CommunityPin[] {
  const { rows, delivered } = useServerPins();
  const queued = useOutbox();
  return mergePins(rows, [...queued, ...delivered]);
}

/** Active pins only — what the public map and KPI counts show. */
export function useCommunityPins(): CommunityPin[] {
  return useAllCommunityPins().filter((pin) => !pin.removed);
}

/**
 * Fire-and-forget attempt to flush the outbox right after a write, so a
 * resident who is online does not wait for a reload or an "online" event
 * (useOutboxDrain's job) to see their pin reach the server. Signing in happens
 * here because there is now something queued to attribute — the rule this plan
 * is bound by is that a visitor who only READS never becomes an auth.users row.
 *
 * Drains through dispatchQueued, not dispatchQueuedPinWrite directly: one
 * queue, one dispatcher. A resident with a queued report and no signal who
 * then drops a pin must not flush only the pin.
 *
 * flushOutbox, not drainOutbox: this is the call most likely to be declined,
 * because a resident marking three flooded streets in a row is writing while
 * the previous write's drain is still on the wire. A declined drain nobody
 * re-runs is a write that never leaves the device while the app is open.
 */
function triggerDrain(): void {
  // Sends only this session's own writes, and signs in only for a write
  // queued with no identity yet. See drainForCurrentSession (I2).
  drainForCurrentSession();
}

/**
 * Queues a new pin and asks the outbox to send it now.
 *
 * Stays void-returning so its call sites do not change — but `enqueue` can
 * throw `OutboxWriteFailed` when the queue itself did not persist (storage
 * full or blocked), and that is left to propagate: a caller that believes a
 * pin was queued when it was not is exactly the failure the outbox exists to
 * prevent.
 */
export function addCommunityPin(input: {
  zoneId: string;
  statusTag: PinStatusTag;
  caption: string;
  lat: number;
  lng: number;
}): void {
  enqueue("createPin", input);
  triggerDrain();
}

/**
 * Whether this resident created the pin.
 *
 * Takes the uid rather than reading a session, because it is called inside the
 * loop that draws every marker — a hook or an await per pin would be a session
 * lookup per marker. Callers get the uid once from `useSessionUserId()`.
 *
 * This decides which BUTTONS to show. Authorisation is RLS's, and RLS reads
 * the verified claim, so a resident who forced this to true still cannot edit
 * anyone else's pin.
 */
export function isOwnPin(pin: CommunityPin, userId: string | null): boolean {
  // A pin still in this device's outbox has no author id yet. It is this
  // resident's own by construction — the outbox only ever holds writes made
  // here — and saying otherwise would take Edit and Delete away from them for
  // the whole time their own pin sits unsent.
  if (pin.authorId === PENDING_AUTHOR_ID) return true;
  return userId !== null && pin.authorId === userId;
}

/**
 * A resident correcting their own pin. `CommunityPinFormValues` carries no
 * photo field — pin photos remain out of scope pending consent and
 * retention rules — so there is nothing photo-related to drop here. See
 * CommunityPin.photoDataUrl.
 */
export function updateCommunityPin(
  pinId: string,
  patch: { statusTag: PinStatusTag; caption: string }
): void {
  enqueue("editPin", { pinId, statusTag: patch.statusTag, caption: patch.caption });
  triggerDrain();
}

/**
 * The author withdrawing their own pin (gated by isOwnPin at the call site).
 * A soft delete server-side — see the Server Action of the same name for why
 * that is not a choice, and why it records no reason.
 */
export function deleteOwnPin(pinId: string): void {
  enqueue("deleteOwnPin", { pinId });
  triggerDrain();
}

/**
 * Admin's own manual removal — PRD Anti-Abuse layer 7/10's human override.
 * Reversible via restoreCommunityPin.
 *
 * Returns the queued entry (not void) so a caller can watch it for
 * `permanentlyFailed` — an out-of-area official's write is refused by RLS,
 * and `mergePins` silently drops a permanently-failed entry from the
 * optimistic view once that happens, reverting the pin back to "active"
 * with no explanation unless something is watching this entry's id.
 */
export function removePinByAdmin(pinId: string): OutboxEntry {
  const entry = enqueue("setPinRemoved", { pinId, removed: true, reason: "admin" });
  triggerDrain();
  return entry;
}

/**
 * Clears a removal (net-score or admin) — the other half of "admin can remove
 * or restore any pin". The reason travels but is ignored on a restore, which
 * clears the column; see the setPinRemoved payload type.
 *
 * Returns the queued entry for the same reason removePinByAdmin does.
 */
export function restoreCommunityPin(pinId: string): OutboxEntry {
  const entry = enqueue("setPinRemoved", { pinId, removed: false, reason: "admin" });
  triggerDrain();
  return entry;
}

/**
 * Whether this resident has already voted on a pin.
 *
 * Reads the pin rather than a store: `ownVote` comes from pin_votes for a
 * server row, and from the queued vote laid over it by mergePins for one that
 * has not been sent yet. That second case is why this takes the merged pin —
 * a resident whose vote is still queued must see the buttons disabled, or they
 * tap again and one opinion becomes two writes.
 *
 * Plain function, not a hook: its only call site reads it inline inside a
 * component already subscribed to useCommunityPins().
 */
export function hasVotedOnPin(pin: CommunityPin): boolean {
  return pin.ownVote !== undefined;
}

/**
 * Casts a vote — PRD Anti-Abuse layer 10, one vote per resident per pin.
 *
 * Queued like every other write; mergePins draws the queued direction onto
 * the pin at once (see mergePins), so the resident sees their vote land
 * before dispatchQueuedVote ever reaches the server.
 *
 * Net-score auto-removal moved to the database with the tallies. It cannot be
 * computed here any more and should not be: a threshold evaluated on one
 * device against that device's view of the counts is a different answer per
 * device. It is decided server-side, by a database trigger — see the
 * pointer comment in community-pin.ts and the
 * pin_votes_apply_net_score_removal migration it names.
 */
export function voteOnPin(pinId: string, direction: 1 | -1): void {
  // The buttons are disabled once a vote is queued (see hasVotedOnPin), so
  // this is the belt to that braces: a second queued vote for one pin is a
  // duplicate the server refuses and the outbox then carries forever.
  //
  // Excludes permanently-failed entries, deliberately. dispatchQueuedVote can
  // now raise PermanentFailure (the placeholder it replaced never could), and
  // without this exclusion a resident whose vote was permanently refused —
  // say, a rejected direction from a stale client build — would have that
  // dead entry sit in the outbox forever satisfying this guard, locking them
  // out of ever voting on the pin again. A permanently-failed entry cannot be
  // "already queued" in any sense that should block a fresh attempt: it is
  // never going to be delivered.
  const alreadyQueued = readOutbox().some(
    (entry) => !entry.permanentlyFailed && payloadOf(entry, "voteOnPin")?.pinId === pinId
  );
  if (alreadyQueued) return;

  enqueue("voteOnPin", { pinId, direction });
  triggerDrain();
}

/**
 * Finds this device's still-queued createPin entry for a pin id, if any.
 *
 * A createPin entry's own outbox id IS the pin's row id (see
 * `dispatchQueuedPinWrite`'s create branch and `CreatePinInput.id`), so this
 * is an exact lookup, not a heuristic: an edit/delete/moderation/vote naming
 * `pinId` matches the createPin entry whose `id` equals it, never itself.
 */
function findQueuedCreateForPin(pinId: string): OutboxEntry | undefined {
  return readOutbox().find((candidate) => candidate.operation === "createPin" && candidate.id === pinId);
}

/**
 * Fix for F1/F5: a write that references a pin (edit, delete, moderation, or
 * vote) must not race that pin's own still-queued createPin.
 *
 * drainOutbox deliberately does not stop on a failure — one bad entry must
 * not strand the ones behind it (see drain.ts) — so without this guard a
 * transient createPin failure lets the SAME drain carry on to a queued
 * edit/delete for that pin. The UPDATE then affects zero rows (the pin does
 * not exist yet), which the pins actions correctly — and unavoidably, from
 * their side — treat as a permanent refusal, binning a perfectly good edit or
 * delete. A deleted pin then reappears once its create finally lands (F1). A
 * vote has the mirror problem: a permanently-failed create makes every
 * queued vote 23503 forever, which vote-on-pin.ts classifies transient, so it
 * retries against a pin that will never exist (F5).
 *
 * So: while the create is live (queued, not yet confirmed, not yet
 * permanently failed), the dependent write is deferred — thrown as transient
 * without ever reaching the server — and retried on the next drain, by which
 * time the create has either landed (this lookup then finds nothing, since
 * markDelivered removed the create entry) or failed for good. Once the
 * create HAS permanently failed, the pin will never exist, so the dependent
 * write is made permanent too, rather than retried forever or sent to the
 * server as a doomed call. With no queued create for the pin at all — the
 * common case, and every case once the create has landed — this is a no-op
 * and the write proceeds exactly as before.
 */
function assertPinIsNotAwaitingCreate(pinId: string): void {
  const create = findQueuedCreateForPin(pinId);
  if (!create) return;
  if (create.permanentlyFailed) {
    throw new PermanentFailure(
      `Pin ${pinId} will never exist — its create permanently failed.`
    );
  }
  throw new Error(`Pin ${pinId}'s create is still queued; waiting for it before this write.`);
}

/**
 * Replays one queued pin write. Thrown errors are what tell drainOutbox
 * whether to retry.
 *
 * The Server Actions are imported dynamically, not at module scope: they pull
 * in user-server.ts's `import "server-only"` transitively, and this file is
 * imported by every component that only READS pins (the map, the zone list,
 * the admin dashboard). A static import would make evaluating this module fail
 * server-only's guard for all of them.
 */
export async function dispatchQueuedPinWrite(entry: OutboxEntry): Promise<void> {
  const actions = await import("@/app/actions/pins");

  const create = payloadOf(entry, "createPin");
  if (create) return settle(await actions.createPin({ id: entry.id, ...create }));

  const edit = payloadOf(entry, "editPin");
  if (edit) {
    assertPinIsNotAwaitingCreate(edit.pinId);
    return settle(await actions.editPin(edit));
  }

  const deletion = payloadOf(entry, "deleteOwnPin");
  if (deletion) {
    assertPinIsNotAwaitingCreate(deletion.pinId);
    return settle(await actions.deleteOwnPin(deletion));
  }

  const moderation = payloadOf(entry, "setPinRemoved");
  if (moderation) {
    assertPinIsNotAwaitingCreate(moderation.pinId);
    return settle(await actions.setPinRemoved(moderation));
  }

  // dispatchers.ts routes four operations here. A fifth added there without a
  // branch here must fail loudly rather than succeed silently and drop the
  // write.
  throw new Error(`Pin dispatcher received an entry it does not handle (${entry.operation})`);
}

function settle(result: { ok: true } | { ok: false; permanent: boolean; error: string }): void {
  if (result.ok) return;
  throw result.permanent ? new PermanentFailure(result.error) : new Error(result.error);
}

/**
 * Replays one queued vote. Thrown errors are what tell drainOutbox whether to
 * retry, exactly like dispatchQueuedPinWrite.
 *
 * Imported dynamically, for the same reason dispatchQueuedPinWrite is: the
 * Server Action pulls in user-server.ts's `import "server-only"`
 * transitively, and this file is imported by every component that only READS
 * pins. A static import here would fail server-only's guard for all of them.
 */
export async function dispatchQueuedVote(entry: OutboxEntry): Promise<void> {
  const vote = payloadOf(entry, "voteOnPin");
  if (!vote) {
    // dispatchers.ts routes exactly one operation here. An entry that is not
    // a vote reaching this function is a routing bug, and it must fail loudly
    // rather than silently drop the write.
    throw new Error(`Vote dispatcher received an entry it does not handle (${entry.operation})`);
  }

  assertPinIsNotAwaitingCreate(vote.pinId);

  const { voteOnPin: voteOnPinAction } = await import("@/app/actions/vote-on-pin");
  settle(await voteOnPinAction(vote));
}
