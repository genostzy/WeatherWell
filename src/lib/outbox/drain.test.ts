import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueue, readOutbox } from "./outbox";
import { drainOutbox, flushOutbox, onDelivered, PermanentFailure } from "./drain";
import type { DrainResult } from "./drain";
import type { OutboxEntry } from "./types";

beforeEach(() => {
  localStorage.clear();
});

describe("drainOutbox", () => {
  it("delivers every queued entry and empties the queue", async () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    enqueue("submitWaterLevelReport", { zoneId: "zone-2", depthLevel: "waist" });

    const result = await drainOutbox(async () => {});

    expect(result.delivered).toBe(2);
    expect(readOutbox()).toHaveLength(0);
  });

  it("keeps an entry that failed transiently, for the next attempt", async () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    const result = await drainOutbox(async () => {
      throw new Error("offline");
    });

    expect(result.delivered).toBe(0);
    expect(readOutbox()[0].permanentlyFailed).toBe(false);
  });

  // "keeps the entry" is deliberately not "keeps it visible": nothing in the
  // UI shows a queued or failed report, and mergeReports drops a
  // permanently-failed one. What this asserts is that the record survives in
  // local storage, which is all it ever asserted.
  it("stops retrying a permanent failure but keeps the entry in the queue", async () => {
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    await drainOutbox(async () => {
      throw new PermanentFailure("row-level security policy");
    });

    const [stored] = readOutbox();
    expect(stored.permanentlyFailed).toBe(true);

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

    const result = await drainOutbox(async (entry) => {
      if (entry.id === first.id) throw new Error("offline");
    });

    expect(result.delivered).toBe(1);
    expect(readOutbox()).toHaveLength(1);
  });

  it("dispatches a queued entry with its own id, then drops it once delivered", async () => {
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    const dispatch = vi.fn().mockResolvedValue(undefined);

    await drainOutbox(dispatch);

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: entry.id }));
    expect(readOutbox()).toHaveLength(0);
  });

  it("runs one drain at a time", async () => {
    // Two concurrent drains would dispatch the same entry twice. The database
    // rejects the duplicate on its primary key, but the wasted request is a
    // real cost on the connection this app assumes.
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    const dispatch = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
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
    const dispatch = vi.fn(async (entry: OutboxEntry) => {
      dispatched.push(entry.id);
      // Queued mid-drain, after the first pass already read the queue.
      if (entry.id === first.id) {
        enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "waist" });
      }
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

    const dispatch = vi.fn(async () => {
      // A stop on the TEST, not on the code under test. Without the one-turn
      // rule this drain never returns, and a hung run is a worse signal than a
      // failed assertion — so after ten passes the failure turns permanent,
      // the loop drains itself of work, and the count below is what reports it.
      if (dispatch.mock.calls.length > 10) throw new PermanentFailure("test stop: looping");
      throw new Error("offline");
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
      await drainOutbox(async () => {});
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
      await drainOutbox(async () => {
        throw new Error("offline");
      });
      expect(listener).not.toHaveBeenCalled();

      // And again on the retry pass, which is the one that would repeat all
      // afternoon on a dead connection.
      await drainOutbox(async () => {
        throw new Error("offline");
      });
    } finally {
      unsubscribe();
    }

    expect(listener).not.toHaveBeenCalled();
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

    const inFlight = drainOutbox(async () => {
      await gate;
    });

    // Filed while that drain is on the wire: this call is declined.
    const flushed = flushOutbox(async () => {});

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
    // twice. Today's dispatcher awaits a dynamic import and cannot do this;
    // Plan 4 adds four more dispatchers to this module.
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    let reentrantResult: DrainResult | undefined;
    const dispatched: string[] = [];

    // Deliberately not async: this body runs entirely inside runDrain's
    // synchronous stretch, before any await has yielded.
    const reentrant = (entry: OutboxEntry): Promise<void> => {
      dispatched.push(entry.id);
      if (dispatched.length === 1) {
        void drainOutbox(reentrant).then((r) => {
          reentrantResult = r;
        });
      }
      return Promise.resolve();
    };

    await drainOutbox(reentrant);
    await vi.waitFor(() => expect(reentrantResult).toBeDefined());

    expect(reentrantResult?.skipped).toBe(true);
    expect(dispatched).toHaveLength(1);
  });

});
