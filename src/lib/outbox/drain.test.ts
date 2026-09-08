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

  it("runs one drain at a time", async () => {
    // Two concurrent drains would dispatch the same entry twice. The database
    // rejects the duplicate on its primary key, but the wasted request is a
    // real cost on the connection this app assumes.
    enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    const dispatch = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await Promise.all([drainOutbox(dispatch), drainOutbox(dispatch)]);
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
