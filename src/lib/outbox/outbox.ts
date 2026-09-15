"use client";

import { createLocalStorageStore } from "@/lib/local-storage-store";
import { knownSessionUserId } from "@/lib/auth/session-user";
import type { OutboxEntry, OutboxOperation, OutboxPayloads } from "./types";

const EMPTY: OutboxEntry[] = [];

const store = createLocalStorageStore<OutboxEntry[]>(
  "weatherwell.outbox",
  "weatherwell:outbox-changed",
  EMPTY
);

/** Every queued write, oldest first. Re-renders when the queue changes. */
export function useOutbox(): OutboxEntry[] {
  return store.useStore();
}

/**
 * Non-reactive read, for the drain loop and for tests. `getSnapshot` is the
 * store's existing non-reactive accessor — the drain runs outside React and
 * cannot call a hook.
 */
export function readOutbox(): OutboxEntry[] {
  return store.getSnapshot();
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

export function enqueue<K extends OutboxOperation>(
  operation: K,
  payload: OutboxPayloads[K]
): OutboxEntry {
  const entry: OutboxEntry = {
    id: crypto.randomUUID(),
    operation,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    permanentlyFailed: false,
    userId: knownSessionUserId(),
  };
  store.update((all) => [...all, entry]);

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
  if (!readOutbox().some((entry) => entry.userId === null)) return;
  store.update((all) => all.map((entry) => (entry.userId === null ? { ...entry, userId } : entry)));
}

/** The write landed. Drop it — the server row is the record now. */
export function markDelivered(id: string): void {
  store.update((all) => all.filter((entry) => entry.id !== id));
}

/**
 * The write did not land. The entry stays queued: a resident's report is the
 * only evidence that a street is flooding, so it is retained for the next
 * attempt rather than dropped.
 *
 * Retained, not surfaced. Nothing in the UI shows a queued or failed state
 * today — `mergeReports` renders a still-queued report as an ordinary live
 * row and drops a permanently-failed one entirely. A pending/failed indicator
 * is a Plan 4 feature, alongside the other four stores that move onto this
 * outbox; until it exists, do not read this retention as the resident being
 * told anything.
 */
export function markFailed(id: string, error: string, permanent: boolean): void {
  store.update((all) =>
    all.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            attempts: entry.attempts + 1,
            lastError: error,
            permanentlyFailed: permanent,
          }
        : entry
    )
  );
}
