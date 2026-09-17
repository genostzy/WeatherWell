"use client";

import type { OutboxEntry } from "./types";

/**
 * The service worker's only view of the queue (it cannot reach
 * `localStorage`), and the mirror the page reconciles its own copy against.
 * See `reconcileWithMirror` in `outbox.ts`.
 */
export const OUTBOX_DB = "weatherwell";
export const OUTBOX_STORE = "outbox";

/**
 * How the page and the service worker tell each other "the queue changed,
 * go look" — the page posts on every `commit`, and listens for the worker's
 * own posts. See `outbox.ts`.
 */
export const OUTBOX_CHANNEL = "weatherwell-outbox";

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

/**
 * Opens (creating on first use) the shared outbox database.
 *
 * Every caller in this module that might run where IndexedDB does not exist
 * — SSR, an old browser, some private-browsing modes — checks `hasIndexedDb`
 * BEFORE calling this, so this rejecting when `indexedDB` is undefined never
 * escapes as an unhandled rejection. It cannot usefully resolve in that case:
 * its declared return type is a real `IDBDatabase`, and there is no such
 * thing to hand back.
 */
export function openOutboxDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("openOutboxDb: indexedDB is not available in this environment"));
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(OUTBOX_DB, 1);
    } catch (error) {
      reject(error);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("openOutboxDb: request failed"));
    request.onblocked = () => reject(new Error("openOutboxDb: blocked by another open connection"));
  });
}

/**
 * Every read/write below resolves rather than rejects on ANY failure —
 * IndexedDB absent, opening it throwing, a transaction erroring out. A
 * mirror write is always best-effort from the page's perspective: the
 * `localStorage` copy `outbox.ts` writes synchronously is the source of
 * truth callers see immediately, so a mirror failure must never surface as
 * an unhandled rejection or an uncaught throw. See the module doc above.
 */
export async function idbGetAll(): Promise<OutboxEntry[]> {
  if (!hasIndexedDb()) return [];
  try {
    const db = await openOutboxDb();
    try {
      return await new Promise<OutboxEntry[]>((resolve) => {
        const tx = db.transaction(OUTBOX_STORE, "readonly");
        const request = tx.objectStore(OUTBOX_STORE).getAll();
        request.onsuccess = () => resolve((request.result as OutboxEntry[]) ?? []);
        request.onerror = () => resolve([]);
      });
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

export async function idbPut(entry: OutboxEntry): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openOutboxDb();
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(OUTBOX_STORE, "readwrite");
        tx.objectStore(OUTBOX_STORE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch {
    // Best-effort mirror — see the module doc above.
  }
}

export async function idbDelete(id: string): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const db = await openOutboxDb();
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(OUTBOX_STORE, "readwrite");
        tx.objectStore(OUTBOX_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch {
    // Best-effort mirror — see the module doc above.
  }
}
