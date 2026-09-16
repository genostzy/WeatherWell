import { describe, it, expect, beforeEach, vi } from "vitest";
import { openOutboxDb, idbGetAll, idbPut, idbDelete, OUTBOX_DB, OUTBOX_STORE } from "./idb";
import type { OutboxEntry } from "./types";

function entry(id: string, overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id,
    operation: "submitWaterLevelReport",
    payload: { zoneId: "zone-1", depthLevel: "knee" },
    queuedAt: "2026-09-16T00:00:00.000Z",
    attempts: 0,
    userId: "user-1",
    status: "pending",
    nextAttemptAt: null,
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * fake-indexeddb keeps its databases in a process-wide singleton for the
 * whole test file, unlike localStorage which each test clears itself. Every
 * test here needs a truly empty store, or an earlier test's rows leak in.
 */
beforeEach(async () => {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(OUTBOX_DB);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
});

describe("idb", () => {
  it("round-trips an entry through put and getAll", async () => {
    await idbPut(entry("a"));
    const all = await idbGetAll();
    expect(all).toEqual([entry("a")]);
  });

  it("removes an entry on delete", async () => {
    await idbPut(entry("a"));
    await idbPut(entry("b"));
    await idbDelete("a");

    const all = await idbGetAll();
    expect(all.map((e) => e.id)).toEqual(["b"]);
  });

  it("creates the outbox object store keyed by id", async () => {
    const db = await openOutboxDb();
    try {
      expect(db.name).toBe(OUTBOX_DB);
      expect(db.objectStoreNames.contains(OUTBOX_STORE)).toBe(true);

      const tx = db.transaction(OUTBOX_STORE, "readonly");
      const store = tx.objectStore(OUTBOX_STORE);
      expect(store.keyPath).toBe("id");
    } finally {
      db.close();
    }
  });

  it("overwrites an entry with the same id rather than duplicating it", async () => {
    await idbPut(entry("a", { attempts: 0 }));
    await idbPut(entry("a", { attempts: 3 }));

    const all = await idbGetAll();
    expect(all).toHaveLength(1);
    expect(all[0].attempts).toBe(3);
  });

  it("getAll resolves empty, rather than rejecting, when IndexedDB is unavailable", async () => {
    const realIndexedDb = globalThis.indexedDB;
    // @ts-expect-error -- simulating SSR / a browser with no IndexedDB.
    delete globalThis.indexedDB;
    try {
      await expect(idbGetAll()).resolves.toEqual([]);
    } finally {
      globalThis.indexedDB = realIndexedDb;
    }
  });

  it("put and delete resolve, rather than rejecting, when IndexedDB is unavailable", async () => {
    const realIndexedDb = globalThis.indexedDB;
    // @ts-expect-error -- simulating SSR / a browser with no IndexedDB.
    delete globalThis.indexedDB;
    try {
      await expect(idbPut(entry("a"))).resolves.toBeUndefined();
      await expect(idbDelete("a")).resolves.toBeUndefined();
    } finally {
      globalThis.indexedDB = realIndexedDb;
    }
  });

  it("getAll resolves empty when opening the database itself fails", async () => {
    // A quota error, a corrupted store, or Safari private mode throwing on
    // open — anything short of "IndexedDB does not exist at all" must still
    // degrade to page-only rather than reject.
    const openSpy = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new DOMException("blocked", "InvalidStateError");
    });
    try {
      await expect(idbGetAll()).resolves.toEqual([]);
    } finally {
      openSpy.mockRestore();
    }
  });
});
