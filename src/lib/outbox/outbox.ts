"use client";

import { createLocalStorageStore } from "@/lib/local-storage-store";
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
  };
  store.update((all) => [...all, entry]);
  return entry;
}

/** The write landed. Drop it — the server row is the record now. */
export function markDelivered(id: string): void {
  store.update((all) => all.filter((entry) => entry.id !== id));
}

/**
 * The write did not land. The entry stays: a resident's report is the only
 * evidence that a street is flooding, and losing it silently is worse than
 * showing it as unsent.
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
