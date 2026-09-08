import { describe, it, expect, beforeEach } from "vitest";
import { enqueue, readOutbox, markDelivered, markFailed } from "./outbox";

beforeEach(() => {
  localStorage.clear();
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
    markFailed(entry.id, "network", false);

    const [stored] = readOutbox();
    expect(stored.attempts).toBe(1);
    expect(stored.lastError).toBe("network");
    expect(stored.permanentlyFailed).toBe(false);
  });

  it("marks a permanent failure so it stops being retried but stays visible", () => {
    // An RLS denial will never succeed on retry. Hammering it wastes a
    // degraded connection, but deleting it hides that something went wrong.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    markFailed(entry.id, "row-level security", true);

    expect(readOutbox()[0].permanentlyFailed).toBe(true);
  });

  it("preserves order, so reports replay in the order they were made", () => {
    const first = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "ankle" });
    const second = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    expect(readOutbox().map((e) => e.id)).toEqual([first.id, second.id]);
  });
});
