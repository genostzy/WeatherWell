import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueue, readOutbox } from "./outbox";
import { drainOutbox, PermanentFailure } from "./drain";

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

  it("stops retrying a permanent failure but keeps it visible", async () => {
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
});
