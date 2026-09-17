import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  enqueue,
  readOutbox,
  useOutbox,
  markDelivered,
  applyEntryOutcome,
  retryEntry,
  discardEntry,
  reconcileWithMirror,
  unholdOwnEntries,
  OutboxWriteFailed,
} from "./outbox";
import { idbGetAll, idbPut, idbDelete, OUTBOX_DB, OUTBOX_CHANNEL } from "./idb";
import * as idb from "./idb";
import * as sync from "./sync";
import type { OutboxEntry } from "./types";

/** Lets a fire-and-forget IndexedDB write actually land before we check it. */
async function tick(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * fake-indexeddb keeps its databases in a process-wide singleton for the
 * whole test file, unlike localStorage which each test clears itself.
 * Without this, an earlier test's mirrored rows leak into the next one via
 * reconcileWithMirror.
 */
async function resetIdb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(OUTBOX_DB);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  localStorage.clear();
  await resetIdb();
});

describe("outbox", () => {
  it("assigns each entry an id, which becomes the database row's key", () => {
    // Client-generated keys are what make replay idempotent: a queued write
    // that actually landed before the connection dropped conflicts on insert
    // instead of creating a second report.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("survives a reload", () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    expect(readOutbox()).toHaveLength(1);
  });

  it("removes an entry once delivered", () => {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    markDelivered(entry.id);
    expect(readOutbox()).toHaveLength(0);
  });

  it("keeps a failed entry and records why, rather than dropping it", () => {
    // The spec is explicit: never drop silently. A resident's report is the
    // only evidence that a street is flooding.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    applyEntryOutcome(entry.id, { result: "retry", error: "network" });

    const [stored] = readOutbox();
    expect(stored.attempts).toBe(1);
    expect(stored.lastError).toBe("network");
    // A transient failure does not give up — status stays "pending" so the
    // next due drain retries it. See schedule.ts's applyOutcome.
    expect(stored.status).toBe("pending");
  });

  it("marks a permanent failure so it stops being retried but stays visible", () => {
    // An RLS denial will never succeed on retry. Hammering it wastes a
    // degraded connection, but deleting it hides that something went wrong.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    applyEntryOutcome(entry.id, { result: "permanent", reason: "row-level security" });

    const [stored] = readOutbox();
    expect(stored.status).toBe("stuck");
    expect(stored.stuckReason).toBe("permanent");
  });

  it("preserves order, so reports replay in the order they were made", () => {
    const first = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "ankle" });
    const second = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    expect(readOutbox().map((e) => e.id)).toEqual([first.id, second.id]);
  });

  it("throws rather than returning a well-formed entry when the write silently fails", () => {
    // createLocalStorageStore's write() swallows every setItem error in a
    // bare catch (quota exceeded, private-mode, blocked storage), so
    // store.update() can return successfully having persisted nothing.
    // Simulate that with a real QuotaExceededError from setItem itself,
    // rather than a no-op stub: this exercises the actual failure mode
    // (setItem throwing mid-write) and proves enqueue's post-write
    // verification — re-reading the snapshot and checking the new id is
    // present — is what catches it, not some assumption about how the
    // stub behaves.
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    try {
      expect(() =>
        enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" })
      ).toThrow(OutboxWriteFailed);
    } finally {
      setItemSpy.mockRestore();
    }

    // Nothing was persisted — the throw must not have been paired with a
    // half-written queue.
    expect(readOutbox()).toHaveLength(0);
  });

  it("sends nothing the resident was told couldn't be saved: no IndexedDB copy, no background send (I-4)", async () => {
    // The worker sends whatever the mirror holds, and reconcile copies a
    // mirror-only row back into the page. A row that reached IndexedDB
    // after OutboxWriteFailed would be sent later anyway, and the resident,
    // told it failed, files it a second time.
    const syncSpy = vi.spyOn(sync, "requestBackgroundSend").mockImplementation(() => {});
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    try {
      expect(() =>
        enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" })
      ).toThrow(OutboxWriteFailed);
    } finally {
      setItemSpy.mockRestore();
    }

    try {
      await tick();
      expect(await idbGetAll()).toEqual([]);
      expect(syncSpy).not.toHaveBeenCalled();
    } finally {
      syncSpy.mockRestore();
    }
  });

  it("wakes the service worker only after the new entry is in the mirror it reads", async () => {
    const events: string[] = [];
    const realPut = idb.idbPut;
    const putSpy = vi.spyOn(idb, "idbPut").mockImplementation(async (written) => {
      await realPut(written);
      events.push(`mirrored ${written.id}`);
    });
    const syncSpy = vi.spyOn(sync, "requestBackgroundSend").mockImplementation(() => {
      events.push("background send requested");
    });
    try {
      const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
      await vi.waitFor(() => expect(syncSpy).toHaveBeenCalledTimes(1));
      expect(events).toEqual([`mirrored ${entry.id}`, "background send requested"]);
    } finally {
      putSpy.mockRestore();
      syncSpy.mockRestore();
    }
  });

  it("stamps a fresh entry pending, due immediately, and mirrors it to IndexedDB", async () => {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    expect(entry.status).toBe("pending");
    expect(entry.nextAttemptAt).toBeNull();
    expect(entry.attempts).toBe(0);
    expect(entry.updatedAt).toBe(entry.queuedAt);

    await tick();

    const mirrored = await idbGetAll();
    expect(mirrored.map((e) => e.id)).toContain(entry.id);
  });
});

describe("legacy migration (normalize)", () => {
  it("converts a legacy permanently-failed entry to status stuck / reason permanent", () => {
    localStorage.setItem(
      "weatherwell.outbox",
      JSON.stringify([
        {
          id: "legacy-1",
          operation: "submitWaterLevelReport",
          payload: { zoneId: "zone-1", depthLevel: "knee" },
          queuedAt: "2026-09-01T00:00:00.000Z",
          attempts: 3,
          userId: "user-1",
          permanentlyFailed: true,
        },
      ])
    );

    const [entry] = readOutbox();
    expect(entry.status).toBe("stuck");
    expect(entry.stuckReason).toBe("permanent");
  });

  it("converts a legacy not-permanently-failed entry to status pending", () => {
    localStorage.setItem(
      "weatherwell.outbox",
      JSON.stringify([
        {
          id: "legacy-2",
          operation: "submitWaterLevelReport",
          payload: { zoneId: "zone-1", depthLevel: "knee" },
          queuedAt: "2026-09-01T00:00:00.000Z",
          attempts: 0,
          userId: "user-1",
          permanentlyFailed: false,
        },
      ])
    );

    expect(readOutbox()[0].status).toBe("pending");
    expect(readOutbox()[0].stuckReason).toBeUndefined();
  });

  it("leaves a legacy entry with no userId field exactly as it was", () => {
    // A phone that has been offline for a week must not lose its queue: an
    // entry from a build old enough to predate userId at all stays without
    // one, which drainForCurrentSession reads as "hold, do not attribute".
    localStorage.setItem(
      "weatherwell.outbox",
      JSON.stringify([
        {
          id: "legacy-3",
          operation: "submitWaterLevelReport",
          payload: { zoneId: "zone-1", depthLevel: "knee" },
          queuedAt: "2026-09-01T00:00:00.000Z",
          attempts: 0,
          permanentlyFailed: false,
        },
      ])
    );

    const [entry] = readOutbox();
    expect("userId" in entry).toBe(false);
    expect(entry.status).toBe("pending");
  });
});

describe("reconcileWithMirror", () => {
  it("prefers the mirror's copy when its updatedAt is newer", async () => {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    await tick();

    const newer: OutboxEntry = {
      ...entry,
      status: "held",
      updatedAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await idbPut(newer);

    await reconcileWithMirror();

    expect(readOutbox()[0].status).toBe("held");
  });

  it("re-puts a page-only entry into IndexedDB rather than dropping it — resending is always safe", async () => {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    // Simulate an interrupted mirror write: IndexedDB never actually got it.
    await idbDelete(entry.id);
    expect(await idbGetAll()).toHaveLength(0);

    await reconcileWithMirror();

    expect(readOutbox()).toHaveLength(1);
    expect(readOutbox()[0].status).toBe("pending");
    const mirrored = await idbGetAll();
    expect(mirrored.map((e) => e.id)).toContain(entry.id);
  });

  it("adds an IndexedDB-only entry (e.g. from the worker) to the page copy", async () => {
    const fromWorker: OutboxEntry = {
      id: "worker-entry",
      operation: "recordCheckIn",
      payload: { zoneId: "zone-1", status: "safe" },
      queuedAt: "2026-09-16T00:00:00.000Z",
      attempts: 0,
      userId: "user-1",
      status: "pending",
      nextAttemptAt: null,
      updatedAt: "2026-09-16T00:00:00.000Z",
    };
    await idbPut(fromWorker);

    await reconcileWithMirror();

    expect(readOutbox().map((e) => e.id)).toContain("worker-entry");
  });

  it("prunes a stuck entry older than 7 days from both copies", async () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const ancient: OutboxEntry = {
      id: "ancient",
      operation: "submitWaterLevelReport",
      payload: { zoneId: "zone-1", depthLevel: "knee" },
      queuedAt: old,
      attempts: 10,
      userId: "user-1",
      status: "stuck",
      stuckReason: "gave_up",
      nextAttemptAt: null,
      updatedAt: old,
    };
    localStorage.setItem("weatherwell.outbox", JSON.stringify([ancient]));
    await idbPut(ancient);

    await reconcileWithMirror();

    expect(readOutbox()).toHaveLength(0);
    expect(await idbGetAll()).toHaveLength(0);
  });

  it("never prunes a held entry, no matter its age", async () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const held: OutboxEntry = {
      id: "held-old",
      operation: "submitWaterLevelReport",
      payload: { zoneId: "zone-1", depthLevel: "knee" },
      queuedAt: old,
      attempts: 0,
      userId: "user-a",
      status: "held",
      nextAttemptAt: null,
      updatedAt: old,
    };
    localStorage.setItem("weatherwell.outbox", JSON.stringify([held]));
    await idbPut(held);

    await reconcileWithMirror();

    expect(readOutbox().map((e) => e.id)).toEqual(["held-old"]);
  });
});

describe("BroadcastChannel wiring", () => {
  it("re-renders useOutbox with the mirror's state on a changed message", async () => {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    await tick();

    const { result } = renderHook(() => useOutbox());
    expect(result.current).toHaveLength(1);

    const heldVersion: OutboxEntry = {
      ...entry,
      status: "held",
      updatedAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await idbPut(heldVersion);

    // A second, independent channel instance — standing in for the service
    // worker or another tab, neither of which is this module's own handle.
    const sender = new BroadcastChannel(OUTBOX_CHANNEL);
    sender.postMessage({ type: "changed" });
    sender.close();

    await vi.waitFor(() => {
      expect(result.current[0]?.status).toBe("held");
    });
  });
});

describe("applyEntryOutcome / retryEntry / discardEntry", () => {
  it("removes a delivered entry from both the page and the mirror", async () => {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    await tick();

    applyEntryOutcome(entry.id, { result: "delivered" });
    await tick();

    expect(readOutbox()).toHaveLength(0);
    expect(await idbGetAll()).toHaveLength(0);
  });

  it("ignores an outcome for an id no longer in the queue", () => {
    // "A 200 for an id not in the queue is ignored" — whatever removed it
    // already decided its fate; there is nothing left here to apply to.
    expect(() => applyEntryOutcome("not-queued", { result: "delivered" })).not.toThrow();
    expect(readOutbox()).toHaveLength(0);
  });

  it("retryEntry clears a stuck entry back to pending with a fresh attempt count", () => {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    applyEntryOutcome(entry.id, { result: "permanent", reason: "denied" });
    expect(readOutbox()[0].status).toBe("stuck");

    retryEntry(entry.id);

    const [retried] = readOutbox();
    expect(retried.status).toBe("pending");
    expect(retried.attempts).toBe(0);
    expect(retried.stuckReason).toBeUndefined();
  });

  it("retryEntry wakes the service worker, but only after the retried row is in the mirror it reads (I-2)", async () => {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    applyEntryOutcome(entry.id, { result: "permanent", reason: "denied" });
    await tick();

    const events: string[] = [];
    const realPut = idb.idbPut;
    const putSpy = vi.spyOn(idb, "idbPut").mockImplementation(async (written) => {
      await realPut(written);
      events.push(`mirrored ${written.id} as ${written.status}`);
    });
    const syncSpy = vi.spyOn(sync, "requestBackgroundSend").mockImplementation(() => {
      events.push("background send requested");
    });
    try {
      retryEntry(entry.id);
      await vi.waitFor(() => expect(syncSpy).toHaveBeenCalledTimes(1));
      expect(events).toEqual([`mirrored ${entry.id} as pending`, "background send requested"]);
    } finally {
      putSpy.mockRestore();
      syncSpy.mockRestore();
    }
  });

  describe("retrying a stuck createPin re-releases the dependents it orphaned (Minor 3)", () => {
    function stored(entry: Partial<OutboxEntry> & { id: string }): OutboxEntry {
      return {
        operation: "submitWaterLevelReport",
        payload: { zoneId: "zone-1", depthLevel: "knee" },
        queuedAt: "2026-09-16T00:00:00.000Z",
        attempts: 0,
        userId: "user-1",
        status: "pending",
        nextAttemptAt: null,
        updatedAt: "2026-09-16T00:00:00.000Z",
        ...entry,
      } as OutboxEntry;
    }

    const create = stored({
      id: "pin-a",
      operation: "createPin",
      payload: { zoneId: "zone-1", statusTag: "flooded", caption: "x", lat: 1, lng: 2 },
      attempts: 10,
      status: "stuck",
      stuckReason: "gave_up",
      lastError: "network",
    });
    const orphanedDelete = stored({
      id: "delete-a",
      operation: "deleteOwnPin",
      payload: { pinId: "pin-a" },
      status: "stuck",
      stuckReason: "permanent",
      lastError: "pin was never created",
    });
    const orphanedVote = stored({
      id: "vote-a",
      operation: "voteOnPin",
      payload: { pinId: "pin-a", direction: 1 },
      status: "stuck",
      stuckReason: "permanent",
      lastError: "pin was never created",
    });
    // Same pin, but refused by the server for its own reason: not an orphan.
    const refusedEdit = stored({
      id: "edit-a",
      operation: "editPin",
      payload: { pinId: "pin-a", statusTag: "flooded", caption: "y" },
      status: "stuck",
      stuckReason: "permanent",
      lastError: "invalid",
    });
    // Orphaned by a DIFFERENT create, which nobody retried.
    const otherOrphan = stored({
      id: "delete-b",
      operation: "deleteOwnPin",
      payload: { pinId: "pin-b" },
      status: "stuck",
      stuckReason: "permanent",
      lastError: "pin was never created",
    });

    it("returns the create and its orphaned dependents to pending, and leaves everything else stuck", async () => {
      localStorage.setItem(
        "weatherwell.outbox",
        JSON.stringify([create, orphanedDelete, orphanedVote, refusedEdit, otherOrphan])
      );

      retryEntry("pin-a");

      const byId = new Map(readOutbox().map((entry) => [entry.id, entry]));
      for (const id of ["pin-a", "delete-a", "vote-a"]) {
        expect(byId.get(id)).toMatchObject({ status: "pending", attempts: 0 });
        expect(byId.get(id)?.stuckReason).toBeUndefined();
        expect(byId.get(id)?.lastError).toBeUndefined();
      }
      expect(byId.get("edit-a")).toMatchObject({ status: "stuck", stuckReason: "permanent", lastError: "invalid" });
      expect(byId.get("delete-b")).toMatchObject({ status: "stuck", lastError: "pin was never created" });

      // The worker reads the mirror, so the re-released rows must reach it too.
      await tick();
      const mirrored = new Map((await idbGetAll()).map((entry) => [entry.id, entry]));
      expect(mirrored.get("delete-a")).toMatchObject({ status: "pending" });
      expect(mirrored.get("vote-a")).toMatchObject({ status: "pending" });
    });

    it("sends the released delete after its create lands, so the deleted pin does not come back", async () => {
      localStorage.setItem("weatherwell.outbox", JSON.stringify([create, orphanedDelete]));

      retryEntry("pin-a");

      const sent: string[] = [];
      const { drainOutbox } = await import("./drain");
      await drainOutbox(async (entry) => {
        sent.push(entry.id);
        return { result: "delivered" };
      });

      expect(sent).toEqual(["pin-a", "delete-a"]);
      expect(readOutbox()).toEqual([]);
    });

    it("retrying an orphaned dependent on its own does not touch its siblings", () => {
      localStorage.setItem("weatherwell.outbox", JSON.stringify([create, orphanedDelete, orphanedVote]));

      retryEntry("delete-a");

      const byId = new Map(readOutbox().map((entry) => [entry.id, entry]));
      expect(byId.get("delete-a")).toMatchObject({ status: "pending" });
      expect(byId.get("vote-a")).toMatchObject({ status: "stuck" });
      expect(byId.get("pin-a")).toMatchObject({ status: "stuck" });
    });
  });

  it("discardEntry removes a stuck entry from both the page and the mirror", async () => {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    applyEntryOutcome(entry.id, { result: "permanent", reason: "denied" });
    await tick();

    discardEntry(entry.id);
    await tick();

    expect(readOutbox()).toHaveLength(0);
    expect(await idbGetAll()).toHaveLength(0);
  });
});

describe("unholdOwnEntries", () => {
  /** Writes a held entry straight to storage, owned by a chosen userId. */
  function seedHeld(id: string, userId: string) {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    localStorage.setItem(
      "weatherwell.outbox",
      JSON.stringify(
        readOutbox().map((e) => (e.id === entry.id ? { ...e, id, userId, status: "held" } : e))
      )
    );
  }

  it("returns a held entry owned by userId to pending, ready to be sent again", () => {
    seedHeld("e1", "user-1");
    expect(readOutbox()[0].status).toBe("held");

    unholdOwnEntries("user-1");

    const [released] = readOutbox();
    expect(released.status).toBe("pending");
    expect(released.nextAttemptAt).toBeNull();
  });

  it("leaves a held entry owned by someone else untouched — the shared-phone seam this closes", () => {
    seedHeld("e1", "user-a");

    unholdOwnEntries("user-b");

    expect(readOutbox()[0]).toMatchObject({ userId: "user-a", status: "held" });
  });

  it("does nothing, and does not write, when there is no held entry for userId", () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    expect(() => unholdOwnEntries("user-1")).not.toThrow();
    expect(readOutbox()[0].status).toBe("pending");
  });
});

describe("reconcileWithMirror does not race a concurrent local write", () => {
  /**
   * Intercepts exactly the NEXT call to idbGetAll and hands back a promise
   * this test controls the resolution of; every call after that (including
   * ones this test makes itself, to check the real mirror afterward) goes
   * through to the real implementation, because `vi.spyOn` without a queued
   * override falls back to calling through.
   */
  function gateNextIdbGetAll(): { release: (value: OutboxEntry[]) => void; spy: ReturnType<typeof vi.spyOn> } {
    const spy = vi.spyOn(idb, "idbGetAll");
    let release: (value: OutboxEntry[]) => void = () => {};
    const gate = new Promise<OutboxEntry[]>((resolve) => {
      release = resolve;
    });
    spy.mockImplementationOnce(() => gate);
    return { release, spy };
  }

  it("does not drop an entry enqueued while reconcileWithMirror's IndexedDB read is in flight", async () => {
    // A reconcile with NOTHING to reconcile returns before ever calling
    // commit() (see the early-return guard), so a race here needs real work
    // for the in-flight reconcile to do — a mirror-only entry, exactly like
    // a service worker delivery the page has not heard about yet.
    const fromWorker: OutboxEntry = {
      id: "worker-only",
      operation: "recordCheckIn",
      payload: { zoneId: "zone-1", status: "safe" },
      queuedAt: "2026-09-16T00:00:00.000Z",
      attempts: 0,
      userId: "user-1",
      status: "pending",
      nextAttemptAt: null,
      updatedAt: "2026-09-16T00:00:00.000Z",
    };
    await idbPut(fromWorker);

    const { release, spy } = gateNextIdbGetAll();
    try {
      const reconciling = reconcileWithMirror();

      // Lands entirely inside reconcile's await window: idbGetAll has
      // already been called (and is suspended on our gate) but has not
      // resolved yet.
      const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

      release([fromWorker]);
      await reconciling;

      expect(readOutbox().map((e) => e.id)).toEqual(expect.arrayContaining([entry.id, "worker-only"]));

      await tick();
      const mirrored = await idbGetAll();
      expect(mirrored.map((e) => e.id)).toEqual(expect.arrayContaining([entry.id, "worker-only"]));
    } finally {
      spy.mockRestore();
    }
  });

  it("does not resurrect an entry delivered-and-deleted while reconcileWithMirror's IndexedDB read is in flight", async () => {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    await idbPut(entry);
    await tick();

    const { release, spy } = gateNextIdbGetAll();
    try {
      const reconciling = reconcileWithMirror();

      // Lands entirely inside reconcile's await window: the write that
      // deletes this entry from the page copy happens after reconcile
      // already took whatever snapshot it took, but before it commits.
      applyEntryOutcome(entry.id, { result: "delivered" });
      expect(readOutbox()).toHaveLength(0);

      // The mirror resolves as having already caught up with the delete —
      // the realistic case, since this simulates the delete's own idbDelete
      // having already landed by the time this reconcile's read completes.
      release([]);
      await reconciling;

      expect(readOutbox()).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("a second tab never resurrects a row this tab removed (Minor 2)", () => {
  it.each([
    ["discarded", (id: string) => discardEntry(id)],
    ["delivered", (id: string) => applyEntryOutcome(id, { result: "delivered" })],
  ] as const)(
    "keeps a %s row gone when another tab reconciles the moment it hears the change",
    async (_label, remove) => {
      const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
      applyEntryOutcome(entry.id, { result: "permanent", reason: "denied" });
      await tick();
      expect((await idbGetAll()).map((e) => e.id)).toEqual([entry.id]);

      // Tab B: same origin, so the same localStorage and IndexedDB, with its
      // own BroadcastChannel. It reconciles on every "changed", exactly as
      // this module does in a real second tab.
      const tabB = new BroadcastChannel(OUTBOX_CHANNEL);
      const reconciles: Promise<void>[] = [];
      tabB.onmessage = () => {
        reconciles.push(reconcileWithMirror());
      };

      // Holds this tab's IndexedDB delete open, the way a slow disk would.
      let releaseDelete!: () => void;
      const deleteGate = new Promise<void>((resolve) => {
        releaseDelete = resolve;
      });
      const realDelete = idb.idbDelete;
      const deleteSpy = vi.spyOn(idb, "idbDelete").mockImplementation(async (id) => {
        await deleteGate;
        await realDelete(id);
      });

      try {
        remove(entry.id);
        expect(readOutbox()).toEqual([]);

        // Give an early broadcast every chance to reach tab B while the
        // delete is still held.
        await tick();
        releaseDelete();
        await vi.waitFor(() => expect(reconciles.length).toBeGreaterThan(0));
        await Promise.all(reconciles);
        await tick();

        expect(readOutbox()).toEqual([]);
        expect(await idbGetAll()).toEqual([]);
      } finally {
        deleteSpy.mockRestore();
        tabB.close();
      }
    }
  );
});

describe("normalize degrades rather than crashes on malformed stored data", () => {
  it("treats a non-array root value as an empty queue instead of throwing", () => {
    localStorage.setItem("weatherwell.outbox", JSON.stringify({ not: "an array" }));
    expect(() => readOutbox()).not.toThrow();
    expect(readOutbox()).toEqual([]);
  });

  it("treats a bare string root value as an empty queue instead of throwing", () => {
    localStorage.setItem("weatherwell.outbox", JSON.stringify("not an array either"));
    expect(() => readOutbox()).not.toThrow();
    expect(readOutbox()).toEqual([]);
  });

  it("skips a null element in the array but keeps the salvageable entries around it", () => {
    const good = {
      id: "good-1",
      operation: "submitWaterLevelReport",
      payload: { zoneId: "zone-1", depthLevel: "knee" },
      queuedAt: "2026-09-01T00:00:00.000Z",
      attempts: 0,
      status: "pending",
      nextAttemptAt: null,
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    localStorage.setItem("weatherwell.outbox", JSON.stringify([good, null]));

    expect(() => readOutbox()).not.toThrow();
    expect(readOutbox().map((e) => e.id)).toEqual(["good-1"]);
  });

  it("skips a non-object primitive element in the array but keeps the salvageable entries", () => {
    const good = {
      id: "good-2",
      operation: "submitWaterLevelReport",
      payload: { zoneId: "zone-1", depthLevel: "knee" },
      queuedAt: "2026-09-01T00:00:00.000Z",
      attempts: 0,
      status: "pending",
      nextAttemptAt: null,
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    localStorage.setItem("weatherwell.outbox", JSON.stringify(["not an entry", 42, good]));

    expect(() => readOutbox()).not.toThrow();
    expect(readOutbox().map((e) => e.id)).toEqual(["good-2"]);
  });
});
