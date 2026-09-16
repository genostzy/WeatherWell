"use client";

import { useSyncExternalStore } from "react";
import { createLocalStorageStore } from "@/lib/local-storage-store";
import { knownSessionUserId } from "@/lib/auth/session-user";
import { idbGetAll, idbPut, idbDelete, OUTBOX_CHANNEL } from "./idb";
import { applyOutcome, retryStuck, shouldPrune } from "./schedule";
import type { SendOutcome } from "./schedule";
import type { OutboxEntry, OutboxOperation, OutboxPayloads, OutboxStatus } from "./types";

const EMPTY: OutboxEntry[] = [];

const store = createLocalStorageStore<OutboxEntry[]>(
  "weatherwell.outbox",
  "weatherwell:outbox-changed",
  EMPTY
);

/**
 * Converts whatever `localStorage` (or the IndexedDB mirror) actually holds
 * into the current five-field shape (`status`, `nextAttemptAt`, `updatedAt`,
 * `lastError?`, `stuckReason?`). Two gaps this closes:
 *
 * - A LEGACY entry, queued by a build from before this file existed: it has
 *   `permanentlyFailed` and no `status` at all. `permanentlyFailed: true`
 *   becomes `status: "stuck", stuckReason: "permanent"`; `false` (or
 *   missing) becomes `status: "pending"`. A missing `userId` field is left
 *   missing — drainForCurrentSession reads that absence as "no one to
 *   attribute this to; hold it" (I2), and this function has no better
 *   answer than the one it already had. A phone that has been offline for a
 *   week must read back its whole queue, not lose it to a shape it does not
 *   recognise.
 * - A current-shape entry missing one of the newer fields — defensive only;
 *   nothing this codebase writes omits them, but a hand-edited or corrupted
 *   `localStorage` value must degrade to a safe default rather than crash
 *   the app.
 *
 * Called on every read (see `normalizedSnapshot`), not just once at
 * migration time, so it also normalizes whatever `reconcileWithMirror` pulls
 * out of IndexedDB — including a future service worker's writes, which are
 * already current-shape but pass through the same defensive branch.
 */
function normalize(raw: OutboxEntry & { permanentlyFailed?: boolean }): OutboxEntry {
  const { permanentlyFailed, status, stuckReason, nextAttemptAt, updatedAt, ...rest } = raw;

  if (status !== undefined) {
    return {
      ...rest,
      status,
      ...(stuckReason !== undefined ? { stuckReason } : {}),
      nextAttemptAt: nextAttemptAt ?? null,
      updatedAt: updatedAt ?? rest.queuedAt,
    };
  }

  const legacyStatus: OutboxStatus = permanentlyFailed ? "stuck" : "pending";
  return {
    ...rest,
    status: legacyStatus,
    ...(permanentlyFailed ? { stuckReason: "permanent" as const } : {}),
    nextAttemptAt: nextAttemptAt ?? null,
    updatedAt: updatedAt ?? rest.queuedAt,
  };
}

// getSnapshot must return a referentially stable value when nothing changed
// (useSyncExternalStore's requirement, same reason createLocalStorageStore
// caches its own parse). `store.getSnapshot()` already gives us that
// stability for the raw parsed array; this layer memoizes the normalized
// array on top of it, keyed by that same reference, so mapping every entry
// through `normalize` on every read never breaks it.
let lastRaw: OutboxEntry[] | null = null;
let lastNormalized: OutboxEntry[] = EMPTY;

function normalizedSnapshot(): OutboxEntry[] {
  const raw = store.getSnapshot();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastNormalized = raw.length === 0 ? EMPTY : raw.map(normalize);
  }
  return lastNormalized;
}

/** Every queued write, oldest first. Re-renders when the queue changes. */
export function useOutbox(): OutboxEntry[] {
  return useSyncExternalStore(store.subscribe, normalizedSnapshot, () => EMPTY);
}

/**
 * Non-reactive read, for the drain loop and for tests. `getSnapshot` is the
 * store's existing non-reactive accessor — the drain runs outside React and
 * cannot call a hook.
 */
export function readOutbox(): OutboxEntry[] {
  return normalizedSnapshot();
}

/**
 * True when `entry` should appear in an optimistic merge for whoever is
 * using this device right now: it is theirs, or it was queued on this
 * device before any identity existed (I2's first-write rule). A held entry
 * left behind by a DIFFERENT person on a shared phone (spec seam M13) must
 * not be drawn as the current person's own pending write — the resident
 * looking at the map right now did not make it, and may never even see it
 * sent, since a held entry only replays for the session that owns it.
 */
export function visibleToCurrentUser(entry: OutboxEntry): boolean {
  return entry.userId === knownSessionUserId() || entry.userId === null;
}

/**
 * Thrown by `enqueue` when `store.update` returns without error but the
 * entry is not actually present afterward — e.g. `localStorage.setItem`
 * silently swallowed a `QuotaExceededError`. A caller that believes a
 * report was queued when it was not is the exact failure this module
 * exists to prevent, so this is surfaced as a thrown error rather than a
 * quietly-wrong return value.
 */
export class OutboxWriteFailed extends Error {
  constructor(id: string) {
    super(
      `Outbox entry ${id} was not persisted after enqueue. Local storage is ` +
        "the likely cause (full, private-mode, or blocked)."
    );
    this.name = "OutboxWriteFailed";
  }
}

/**
 * A `BroadcastChannel(OUTBOX_CHANNEL)` handle, lazily created and reused —
 * `BroadcastChannel` is absent in SSR and can be absent in an old browser,
 * so nothing here may assume it exists.
 */
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel(OUTBOX_CHANNEL);
  return channel;
}

function broadcastChanged(): void {
  getChannel()?.postMessage({ type: "changed" });
}

/**
 * The one path every write in this module goes through.
 *
 * Writes `localStorage` synchronously, exactly as before this file mirrored
 * anything — `OutboxWriteFailed` detection depends on that write having
 * already happened by the time this function returns. IndexedDB and the
 * broadcast come after, and neither can fail this call: `idbPut`/`idbDelete`
 * resolve rather than reject in every case (see idb.ts), and this fires
 * them without awaiting, so a slow or unavailable IndexedDB never makes a
 * synchronous caller (enqueue, markDelivered, …) wait on it.
 */
function commit(next: OutboxEntry[], changed: OutboxEntry[] = [], deletedIds: string[] = []): void {
  store.write(next);
  for (const entry of changed) void idbPut(entry);
  for (const id of deletedIds) void idbDelete(id);
  broadcastChanged();
}

export function enqueue<K extends OutboxOperation>(
  operation: K,
  payload: OutboxPayloads[K]
): OutboxEntry {
  const queuedAt = new Date().toISOString();
  const entry: OutboxEntry = {
    id: crypto.randomUUID(),
    operation,
    payload,
    queuedAt,
    attempts: 0,
    userId: knownSessionUserId(),
    status: "pending",
    nextAttemptAt: null,
    updatedAt: queuedAt,
  };

  commit([...readOutbox(), entry], [entry]);

  // store.write() swallows every localStorage error (quota exceeded,
  // private-mode, blocked storage) in a bare catch, so a call above can
  // return having persisted nothing. Verify the entry actually landed
  // before handing it back as if it had.
  const persisted = store.getSnapshot().some((stored) => stored.id === entry.id);
  if (!persisted) {
    throw new OutboxWriteFailed(entry.id);
  }

  return entry;
}

/**
 * Attributes every entry queued with no identity (`userId: null`) to
 * `userId`. Legacy entries with no `userId` field are left alone; see
 * drainForCurrentSession.
 */
export function claimUnattributed(userId: string): void {
  const all = readOutbox();
  if (!all.some((entry) => entry.userId === null)) return;

  const updatedAt = new Date().toISOString();
  const changed: OutboxEntry[] = [];
  const next = all.map((entry) => {
    if (entry.userId !== null) return entry;
    const claimed = { ...entry, userId, updatedAt };
    changed.push(claimed);
    return claimed;
  });
  commit(next, changed);
}

/** The write landed. Drop it — the server row is the record now. */
export function markDelivered(id: string): void {
  const all = readOutbox();
  if (!all.some((entry) => entry.id === id)) return;
  commit(
    all.filter((entry) => entry.id !== id),
    [],
    [id]
  );
}

/**
 * Applies one send result (see `SendOutcome` in schedule.ts) to a queued
 * entry: `delivered` removes it, everything else advances its `status` /
 * `attempts` / `nextAttemptAt` per `applyOutcome`'s rules. An id no longer
 * in the queue is ignored — "a 200 for an id not in the queue" is the
 * design doc's own example, but the same reasoning covers every outcome:
 * whatever removed it already decided its fate.
 */
export function applyEntryOutcome(id: string, outcome: SendOutcome): void {
  const all = readOutbox();
  const current = all.find((entry) => entry.id === id);
  if (!current) return;

  const result = applyOutcome(current, outcome, new Date());
  if (result === null) {
    commit(
      all.filter((entry) => entry.id !== id),
      [],
      [id]
    );
    return;
  }
  commit(
    all.map((entry) => (entry.id === id ? result : entry)),
    [result]
  );
}

/**
 * The write did not land. Kept as a thin wrapper over `applyEntryOutcome`
 * for callers (and tests) written against the old two-outcome shape: a
 * resident's report is the only evidence a street is flooding, so it stays
 * queued either way rather than being dropped.
 */
export function markFailed(id: string, error: string, permanent: boolean): void {
  applyEntryOutcome(id, permanent ? { result: "permanent", reason: error } : { result: "retry", error });
}

/**
 * A resident (or an admin, via the badge) asking to retry a stuck entry:
 * attempts and the stuck reason clear, and it is due again immediately.
 */
export function retryEntry(id: string): void {
  const all = readOutbox();
  const current = all.find((entry) => entry.id === id);
  if (!current) return;

  const retried = retryStuck(current, new Date());
  commit(
    all.map((entry) => (entry.id === id ? retried : entry)),
    [retried]
  );
}

/** A stuck entry the resident chose not to send after all. Gone for good. */
export function discardEntry(id: string): void {
  const all = readOutbox();
  if (!all.some((entry) => entry.id === id)) return;
  commit(
    all.filter((entry) => entry.id !== id),
    [],
    [id]
  );
}

function sameEntry(a: OutboxEntry, b: OutboxEntry): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Reconciles the page's `localStorage` copy against the IndexedDB mirror by
 * id, per the design doc:
 *
 * 1. read both copies (each normalized, so a legacy or malformed row on
 *    either side is already in current shape before anything compares it);
 * 2. union by id;
 * 3. for an id in both, keep whichever has the greater `updatedAt` —
 *    typically the mirror, since only the worker (or another tab) can move
 *    an entry without this page's own knowledge;
 * 4. an id only on the page is re-put to IndexedDB — the mirror missed a
 *    write (an interrupted `idbPut`, a private tab that never had
 *    IndexedDB), and the fix is to give it another copy, not to drop the
 *    page's;
 * 5. an id only in IndexedDB (the worker sent something, or delivered
 *    something, while this page was closed) is added to the page;
 * 6. a `stuck` entry old enough is pruned from both — see `shouldPrune`;
 * 7. commit — but only if something actually changed. Every step above is
 *    idempotent, so calling this repeatedly (once on load, once per
 *    `BroadcastChannel` message, possibly from more than one open tab) must
 *    reach a fixed point rather than commit-and-broadcast forever: a commit
 *    here broadcasts, which is what wakes every OTHER open tab's own
 *    reconcile, and a reconcile that always re-commits even when nothing
 *    changed would never let that chain settle.
 *
 * Never drops an entry it cannot explain: an id this function has never
 * seen before, on either side, is kept — "when it is impossible to tell
 * whether an entry was delivered by the worker or never mirrored, the entry
 * is sent again" (design doc, section 1). The only path that removes an
 * entry here is the explicit prune in step 6.
 */
export async function reconcileWithMirror(): Promise<void> {
  const pageEntries = readOutbox();
  const mirrorEntries = (await idbGetAll()).map(normalize);

  const pageById = new Map(pageEntries.map((entry) => [entry.id, entry] as const));
  const mirrorById = new Map(mirrorEntries.map((entry) => [entry.id, entry] as const));

  const winners = new Map<string, OutboxEntry>();
  for (const entry of pageEntries) {
    const mirror = mirrorById.get(entry.id);
    winners.set(
      entry.id,
      mirror && Date.parse(mirror.updatedAt) > Date.parse(entry.updatedAt) ? mirror : entry
    );
  }
  for (const entry of mirrorEntries) {
    if (!winners.has(entry.id)) winners.set(entry.id, entry);
  }

  const now = new Date();
  const survivors = [...winners.values()].filter((entry) => !shouldPrune(entry, now));
  const prunedIds = [...winners.values()].filter((entry) => shouldPrune(entry, now)).map((entry) => entry.id);

  // Page order first, so an open tab's list does not visibly reshuffle on
  // every reconcile; anything the mirror alone knew about is appended.
  const ordered = [
    ...pageEntries
      .map((entry) => winners.get(entry.id))
      .filter((entry): entry is OutboxEntry => entry !== undefined && !prunedIds.includes(entry.id)),
    ...survivors.filter((entry) => !pageById.has(entry.id)),
  ];

  const pageChanged =
    ordered.length !== pageEntries.length ||
    ordered.some((entry, index) => !sameEntry(entry, pageEntries[index]));

  const toPut = ordered.filter((entry) => {
    const mirror = mirrorById.get(entry.id);
    return !mirror || !sameEntry(mirror, entry);
  });

  if (!pageChanged && toPut.length === 0 && prunedIds.length === 0) return;

  commit(ordered, toPut, prunedIds);
}

if (typeof window !== "undefined") {
  const initChannel = getChannel();
  initChannel?.addEventListener("message", (event) => {
    const data = (event as MessageEvent).data as { type?: string } | undefined;
    if (data?.type === "changed") void reconcileWithMirror();
  });
  void reconcileWithMirror();
}
