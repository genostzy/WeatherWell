import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueue, readOutbox } from "./outbox";
import { drainOutbox, flushOutbox, onDelivered } from "./drain";
import type { DrainResult } from "./drain";
import type { SendOutcome } from "./schedule";
import type { OutboxEntry } from "./types";

beforeEach(() => {
  localStorage.clear();
});

/** Every dispatch in this file resolves to a SendOutcome (Task 4) rather than resolving void or throwing. */
const DELIVERED: SendOutcome = { result: "delivered" };

describe("drainOutbox", () => {
  it.each([
    ["a null payload", null],
    ["no payload at all", undefined],
  ])("does not crash on a dependent write with %s, and still sends the rest (Minor 1)", async (_label, payload) => {
    const malformed: Record<string, unknown> = {
      id: "malformed-edit",
      operation: "editPin",
      queuedAt: "2026-09-16T00:00:00.000Z",
      attempts: 0,
      userId: null,
      status: "pending",
      nextAttemptAt: null,
      updatedAt: "2026-09-16T00:00:00.000Z",
    };
    if (payload !== undefined) malformed.payload = payload;
    localStorage.setItem("weatherwell.outbox", JSON.stringify([malformed]));
    const good = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    const sent: string[] = [];
    const result = await drainOutbox(async (entry) => {
      sent.push(entry.id);
      return DELIVERED;
    });

    expect(sent).toContain(good.id);
    expect(result.delivered).toBeGreaterThanOrEqual(1);
  });

  it("delivers every queued entry and empties the queue", async () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    enqueue("submitWaterLevelReport", { zoneId: "zone-2", depthLevel: "waist" });

    const result = await drainOutbox(async () => DELIVERED);

    expect(result.delivered).toBe(2);
    expect(readOutbox()).toHaveLength(0);
  });

  it("keeps an entry that failed transiently, for the next attempt", async () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    const result = await drainOutbox(async () => ({ result: "retry", error: "offline" }));

    expect(result.delivered).toBe(0);
    // A transient failure does not give up — status stays "pending" so a
    // later due drain retries it (see schedule.ts's applyOutcome).
    expect(readOutbox()[0].status).toBe("pending");
  });

  // "keeps the entry" is deliberately not "keeps it visible": nothing in the
  // UI shows a queued or failed report, and mergeReports drops a
  // permanently-failed one. What this asserts is that the record survives in
  // local storage, which is all it ever asserted.
  it("stops retrying a permanent failure but keeps the entry in the queue", async () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    await drainOutbox(async () => ({ result: "permanent", reason: "row-level security policy" }));

    const [stored] = readOutbox();
    expect(stored.status).toBe("stuck");

    // A second drain must not touch it again — retrying an RLS denial burns a
    // degraded connection for a result that cannot change.
    const dispatch = vi.fn();
    await drainOutbox(dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not stop at the first transient failure", async () => {
    // One unlucky entry must not strand every report behind it.
    const first = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    enqueue("submitWaterLevelReport", { zoneId: "zone-2", depthLevel: "waist" });

    const result = await drainOutbox(async (entry): Promise<SendOutcome> =>
      entry.id === first.id ? { result: "retry", error: "offline" } : DELIVERED
    );

    expect(result.delivered).toBe(1);
    expect(readOutbox()).toHaveLength(1);
  });

  it("dispatches a queued entry with its own id, then drops it once delivered", async () => {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    const dispatch = vi.fn().mockResolvedValue(DELIVERED);

    await drainOutbox(dispatch);

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: entry.id }));
    expect(readOutbox()).toHaveLength(0);
  });

  it("treats a dispatcher that throws unexpectedly as retry rather than crashing the drain", async () => {
    // dispatchQueued (sendEntry) never throws in production — a network
    // failure already maps to { result: "retry" } — but a dispatch function
    // is still a caller-supplied callback, and one misbehaving implementation
    // must not strand the drain or every entry behind it.
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    const result = await drainOutbox(async () => {
      throw new Error("bug in a dispatcher, not a SendOutcome");
    });

    expect(result.delivered).toBe(0);
    expect(result.failed).toBe(1);
    expect(readOutbox()[0].status).toBe("pending");
  });

  it("runs one drain at a time", async () => {
    // Two concurrent drains would dispatch the same entry twice. The database
    // rejects the duplicate on its primary key, but the wasted request is a
    // real cost on the connection this app assumes.
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    const dispatch = vi.fn(async (): Promise<SendOutcome> => {
      await new Promise((r) => setTimeout(r, 10));
      return DELIVERED;
    });

    const [first, second] = await Promise.all([drainOutbox(dispatch), drainOutbox(dispatch)]);
    expect(dispatch).toHaveBeenCalledOnce();

    // Exactly one of the two calls actually ran; the other must be
    // identifiable as declined rather than looking like an empty queue.
    const results = [first, second];
    expect(results.filter((r) => r.skipped)).toHaveLength(1);
    expect(results.filter((r) => !r.skipped)).toHaveLength(1);

    const skippedResult = results.find((r) => r.skipped)!;
    expect(skippedResult.delivered).toBe(0);
    expect(skippedResult.failed).toBe(0);

    const ranResult = results.find((r) => !r.skipped)!;
    expect(ranResult.delivered).toBe(1);
  });

  it("picks up a report queued while it was already draining", async () => {
    // The window that matters: a resident tapping "Report again" during a
    // flood files the second report while the first is still on the wire. A
    // drain that iterates the snapshot it took at entry never sees it, and the
    // concurrent triggerDrain is declined — so that report waits for a reload
    // or an "online" event that never comes while they sit on the page.
    const first = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    const dispatched: string[] = [];
    const dispatch = vi.fn(async (entry: OutboxEntry): Promise<SendOutcome> => {
      dispatched.push(entry.id);
      // Queued mid-drain, after the first pass already read the queue.
      if (entry.id === first.id) {
        enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "waist" });
      }
      return DELIVERED;
    });

    const result = await drainOutbox(dispatch);

    expect(dispatched).toHaveLength(2);
    expect(result.delivered).toBe(2);
    expect(readOutbox()).toHaveLength(0);
  });

  it("gives each entry one turn per drain, so a failing queue cannot loop forever", async () => {
    // Re-reading the queue after every pass is what picks up a mid-drain
    // arrival. On its own it would also re-read the entry that just failed
    // transiently and dispatch it again, and again, forever — on a dead
    // connection, which is precisely when it would happen. A transient failure
    // belongs to the NEXT drain.
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    enqueue("submitWaterLevelReport", { zoneId: "zone-2", depthLevel: "waist" });

    const dispatch = vi.fn(async (): Promise<SendOutcome> => {
      // A stop on the TEST, not on the code under test. Without the one-turn
      // rule this drain never returns, and a hung run is a worse signal than a
      // failed assertion — so after ten passes the failure turns permanent,
      // the loop drains itself of work, and the count below is what reports it.
      if (dispatch.mock.calls.length > 10) return { result: "permanent", reason: "test stop: looping" };
      return { result: "retry", error: "offline" };
    });

    const result = await drainOutbox(dispatch);

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(2);
    expect(readOutbox()).toHaveLength(2);
  });

  it("announces what it delivered, so a delivered report can be kept on screen", async () => {
    // markDelivered drops the entry the instant the server confirms it, which
    // withdraws the optimistic row the resident is looking at. Something has
    // to say which rows just went, or success looks identical to loss.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    const announced: OutboxEntry[][] = [];
    const unsubscribe = onDelivered((delivered) => announced.push(delivered));

    try {
      await drainOutbox(async () => DELIVERED);
    } finally {
      unsubscribe();
    }

    expect(announced).toHaveLength(1);
    expect(announced[0].map((e) => e.id)).toEqual([entry.id]);
  });

  it("says nothing when a drain delivered nothing", async () => {
    // The listener above triggers a refetch. A drain that delivered nothing —
    // an empty queue, an offline pass — must not spend a request on it.
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    const listener = vi.fn();
    const unsubscribe = onDelivered(listener);

    try {
      // A pass with a queued entry that did not get through.
      await drainOutbox(async () => ({ result: "retry", error: "offline" }));
      expect(listener).not.toHaveBeenCalled();

      // And again on the retry pass, which is the one that would repeat all
      // afternoon on a dead connection.
      await drainOutbox(async () => ({ result: "retry", error: "offline" }));
    } finally {
      unsubscribe();
    }

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("drainOutbox respects schedule.ts", () => {
  it("does not dispatch an entry before its backoff window has passed", async () => {
    // Simulates a prior transient failure that backed this entry off into
    // the future — the shape applyOutcome's retry branch actually produces.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    const future = new Date(Date.now() + 60_000).toISOString();
    localStorage.setItem(
      "weatherwell.outbox",
      JSON.stringify([{ ...entry, attempts: 1, nextAttemptAt: future }])
    );

    const dispatch = vi.fn();
    const result = await drainOutbox(dispatch);

    expect(dispatch).not.toHaveBeenCalled();
    expect(result.delivered).toBe(0);
    expect(result.failed).toBe(0);
    expect(readOutbox()).toHaveLength(1);
  });

  it("leaves a pin-dependent entry queued and untouched while its create is still pending", async () => {
    // Queue order (design doc): an editPin/deleteOwnPin/setPinRemoved/
    // voteOnPin entry must not race its own pin's still-queued createPin.
    // This exercises drainOutbox's own isBlockedByPendingCreate filter
    // directly, without going through the route.
    const create = enqueue("createPin", {
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Market",
      lat: 16.06,
      lng: 120.4,
    });
    const edit = enqueue("editPin", { pinId: create.id, statusTag: "receding", caption: "Going down" });

    const dispatch = vi.fn(async (entry: OutboxEntry): Promise<SendOutcome> => {
      if (entry.id === create.id) return { result: "retry", error: "offline" };
      throw new Error(`unexpected dispatch of blocked entry ${entry.id}`);
    });

    const result = await drainOutbox(dispatch);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: create.id }));
    expect(result.delivered).toBe(0);

    const stillQueuedEdit = readOutbox().find((e) => e.id === edit.id);
    expect(stillQueuedEdit).toMatchObject({ status: "pending", attempts: 0 });
  });

  // Regression coverage for final-review.md F5, moved here from
  // community-pins.test.ts (Task 4): a permanently-failed create means the
  // pin will never exist, so a dependent write must fail permanently too,
  // rather than retry a request that can only ever be refused. Formerly
  // proved by driving dispatchQueuedVote against a faked Supabase client;
  // now the drain settles this itself, before ever calling dispatch, via
  // isOrphanedByFailedCreate — so this drives drainOutbox directly and
  // asserts dispatch is never even called for the orphaned vote.
  it("F5: settles a vote on a pin whose create has permanently failed, without ever dispatching it", async () => {
    const create = enqueue("createPin", {
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Knee-deep",
      lat: 16.06,
      lng: 120.4,
    });
    // Simulates an earlier drain having already permanently failed this
    // create (e.g. an RLS denial) — the pin will never exist.
    localStorage.setItem(
      "weatherwell.outbox",
      JSON.stringify(
        readOutbox().map((e) =>
          e.id === create.id ? { ...e, status: "stuck", stuckReason: "permanent", lastError: "denied" } : e
        )
      )
    );
    const vote = enqueue("voteOnPin", { pinId: create.id, direction: 1 });

    const dispatch = vi.fn(async (entry: OutboxEntry): Promise<SendOutcome> => {
      if (entry.id === vote.id) throw new Error("the orphaned vote must never be dispatched");
      return DELIVERED;
    });

    const result = await drainOutbox(dispatch);

    expect(dispatch).not.toHaveBeenCalled();
    expect(result.delivered).toBe(0);
    expect(result.failed).toBe(1);

    const voteEntry = readOutbox().find((entry) => entry.id === vote.id);
    expect(voteEntry).toMatchObject({
      status: "stuck",
      stuckReason: "permanent",
      lastError: "pin was never created",
    });
  });
});

describe("flushOutbox", () => {
  it("does not accept a declined drain as an answer", async () => {
    // DrainResult.skipped exists so a caller can tell "another drain was
    // already running" apart from "the queue is empty". Both production
    // callers used to ignore it, which is how a report filed mid-drain sat
    // unsent for the rest of the session. flushOutbox waits for the drain that
    // declined it and then takes its own turn.
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const inFlight = drainOutbox(async (): Promise<SendOutcome> => {
      await gate;
      return DELIVERED;
    });

    // Filed while that drain is on the wire: this call is declined.
    const flushed = flushOutbox(async () => DELIVERED);

    release();
    await inFlight;

    const result = await flushed;
    expect(result.skipped).toBe(false);
  });
  it("declines a dispatcher that re-enters before yielding", async () => {
    // An async function body runs synchronously up to its first `await`, and
    // runDrain's first await is `dispatch(entry)`. A dispatcher that calls
    // back into drainOutbox before yielding would, with a gate raised only
    // after runDrain was invoked, find nothing set and start a second
    // concurrent drain over the same queue — dispatching the same entry
    // twice. Today's dispatcher POSTs through fetch and cannot do this;
    // this proves the guard rather than the current dispatcher's shape.
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    let reentrantResult: DrainResult | undefined;
    const dispatched: string[] = [];

    // Deliberately not async: this body runs entirely inside runDrain's
    // synchronous stretch, before any await has yielded.
    const reentrant = (entry: OutboxEntry): Promise<SendOutcome> => {
      dispatched.push(entry.id);
      if (dispatched.length === 1) {
        void drainOutbox(reentrant).then((r) => {
          reentrantResult = r;
        });
      }
      return Promise.resolve(DELIVERED);
    };

    await drainOutbox(reentrant);
    await vi.waitFor(() => expect(reentrantResult).toBeDefined());

    expect(reentrantResult?.skipped).toBe(true);
    expect(dispatched).toHaveLength(1);
  });
});
