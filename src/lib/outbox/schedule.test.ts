import { describe, it, expect } from "vitest";
import {
  applyOutcome,
  isDue,
  shouldPrune,
  isBlockedByPendingCreate,
  isOrphanedByFailedCreate,
  retryStuck,
  BACKOFF_MINUTES,
  MAX_ATTEMPTS,
  GIVE_UP_AFTER_MS,
  PRUNE_STUCK_AFTER_MS,
  type SendOutcome,
} from "./schedule";
import type { OutboxEntry } from "./types";
import cases from "./schedule-cases.json";

// This file and public/sw.js's copy of the retry rules are both tested
// against schedule-cases.json (see Task 2's brief and the design doc,
// section 2), so the two implementations cannot silently drift apart. Adding
// a case here is adding a case for the service worker too.

describe("schedule: applyOutcome", () => {
  for (const testCase of cases.applyOutcome) {
    it(testCase.name, () => {
      const result = applyOutcome(
        testCase.entry as OutboxEntry,
        testCase.outcome as SendOutcome,
        new Date(testCase.now)
      );
      if (testCase.expect === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toMatchObject(testCase.expect as Record<string, unknown>);
      }
    });
  }
});

describe("schedule: isDue", () => {
  for (const testCase of cases.isDue) {
    it(testCase.name, () => {
      expect(isDue(testCase.entry as OutboxEntry, new Date(testCase.now))).toBe(testCase.expect);
    });
  }
});

describe("schedule: shouldPrune", () => {
  for (const testCase of cases.shouldPrune) {
    it(testCase.name, () => {
      expect(shouldPrune(testCase.entry as OutboxEntry, new Date(testCase.now))).toBe(
        testCase.expect
      );
    });
  }
});

describe("schedule: isBlockedByPendingCreate", () => {
  for (const testCase of cases.isBlockedByPendingCreate) {
    it(testCase.name, () => {
      expect(
        isBlockedByPendingCreate(testCase.entry as OutboxEntry, testCase.queue as OutboxEntry[])
      ).toBe(testCase.expect);
    });
  }
});

describe("schedule: isOrphanedByFailedCreate", () => {
  for (const testCase of cases.isOrphanedByFailedCreate) {
    it(testCase.name, () => {
      const entry = testCase.entry as OutboxEntry;
      const queue = testCase.queue as OutboxEntry[];
      expect(isOrphanedByFailedCreate(entry, queue)).toBe(testCase.expect);
      // Fix round 1 (R4): the two predicates must never agree — blocked
      // means "wait", orphaned means "give up". Every row in this table
      // carries the expected isBlockedByPendingCreate result for the exact
      // same fixture, so that non-overlap is asserted here rather than
      // trusted.
      expect(isBlockedByPendingCreate(entry, queue)).toBe(testCase.expectBlocked);
    });
  }
});

describe("schedule: exported thresholds", () => {
  // The service worker's plain-JS copy of these rules (public/sw.js, added in
  // a later task) is tested against the same schedule-cases.json, but it
  // cannot import these constants — it has to restate them. Pinning their
  // values here is what makes a drift between the two copies show up as a
  // failing test instead of a silent behaviour split.
  it("matches the documented backoff table and give-up/prune thresholds", () => {
    expect(BACKOFF_MINUTES).toEqual([0, 1, 5, 15, 60]);
    expect(MAX_ATTEMPTS).toBe(10);
    expect(GIVE_UP_AFTER_MS).toBe(3 * 24 * 60 * 60 * 1000);
    expect(PRUNE_STUCK_AFTER_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("schedule: retryStuck", () => {
  it("resets attempts to 0, status to pending, nextAttemptAt to now, and clears stuckReason/lastError", () => {
    const now = new Date("2026-09-16T12:00:00.000Z");
    const stuck: OutboxEntry = {
      id: "e-stuck",
      operation: "submitWaterLevelReport",
      payload: { zoneId: "zone-1", depthLevel: "knee" },
      queuedAt: "2026-09-01T00:00:00.000Z",
      attempts: 10,
      userId: "user-1",
      status: "stuck",
      stuckReason: "gave_up",
      lastError: "network",
      nextAttemptAt: null,
      updatedAt: "2026-09-10T00:00:00.000Z",
    };

    const result = retryStuck(stuck, now);

    expect(result.attempts).toBe(0);
    expect(result.status).toBe("pending");
    expect(result.nextAttemptAt).toBe(now.toISOString());
    expect(result.updatedAt).toBe(now.toISOString());
    expect(result.stuckReason).toBeUndefined();
    expect(result.lastError).toBeUndefined();
  });
});
