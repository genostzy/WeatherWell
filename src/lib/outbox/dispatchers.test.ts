import { describe, it, expect, beforeEach } from "vitest";
import { payloadOf } from "./dispatchers";
import { enqueue } from "./outbox";

beforeEach(() => {
  localStorage.clear();
});

describe("payloadOf", () => {
  it("narrows a payload when the operation matches", () => {
    const entry = enqueue("recordCheckIn", { zoneId: "zone-1", status: "safe" });

    expect(payloadOf(entry, "recordCheckIn")).toEqual({ zoneId: "zone-1", status: "safe" });
  });

  it("returns undefined for an entry of a different operation", () => {
    // A store merging its own queued writes must never render another
    // store's entry as one of its own. Before six operations shared this
    // queue, a merge could filter on nothing and be right by accident.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    expect(payloadOf(entry, "recordCheckIn")).toBeUndefined();
  });
});

describe("dispatchQueued", () => {
  it("refuses an operation it has no dispatcher for", async () => {
    // A new operation added to the union without a dispatcher must fail
    // loudly at the first drain rather than silently succeeding and
    // dropping the write. The cast is the point of the test: it stands in
    // for the future edit that adds a case to the union and forgets one here.
    const { dispatchQueued } = await import("./dispatchers");
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    const broken = { ...entry, operation: "notAnOperation" as unknown as typeof entry.operation };

    await expect(dispatchQueued(broken)).rejects.toThrow(/no dispatcher/i);
  });
});
