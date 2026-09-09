"use client";

import type { OutboxEntry, OutboxOperation, OutboxPayloads } from "./types";

/**
 * Narrows an entry's payload by its operation.
 *
 * Seven operations now share one queue, so every consumer that reads the outbox
 * — the stores merging their own queued writes onto server rows — must filter
 * by operation before touching a payload. Returning `undefined` rather than
 * throwing lets a store write `.map(...).filter(Boolean)` over a mixed queue,
 * which is what all three of them want.
 */
export function payloadOf<K extends OutboxOperation>(
  entry: OutboxEntry,
  operation: K
): OutboxPayloads[K] | undefined {
  return entry.operation === operation ? (entry.payload as OutboxPayloads[K]) : undefined;
}

/**
 * The Server Actions are imported dynamically, one per branch, and never at
 * module scope.
 *
 * Every action pulls in `user-server.ts`'s `import "server-only"`
 * transitively. This module is reached from `use-outbox-drain.ts`, which is
 * mounted in the root layout, and from three client stores that components
 * import purely to READ. A static import would make evaluating any of them
 * fail server-only's guard. Plan 3 proved this by experiment: making the one
 * report import static broke five test files.
 *
 * Splitting the imports per branch rather than one shared import at the top
 * of the function also means a resident who only ever votes never downloads
 * the check-in action.
 */
export async function dispatchQueued(entry: OutboxEntry): Promise<void> {
  switch (entry.operation) {
    case "submitWaterLevelReport": {
      const { dispatchQueuedReport } = await import("@/lib/water-level-reports");
      return dispatchQueuedReport(entry);
    }
    case "createPin":
    case "editPin":
    case "deleteOwnPin":
    case "setPinRemoved": {
      const { dispatchQueuedPinWrite } = await import("@/lib/community-pins");
      return dispatchQueuedPinWrite(entry);
    }
    case "voteOnPin": {
      const { dispatchQueuedVote } = await import("@/lib/community-pins");
      return dispatchQueuedVote(entry);
    }
    case "recordCheckIn": {
      const { dispatchQueuedCheckIn } = await import("@/lib/evacuation-checkins");
      return dispatchQueuedCheckIn(entry);
    }
    default:
      // Not unreachable in practice: an entry read back from localStorage was
      // written by an older build, and a future edit that adds a case to the
      // union and forgets one here compiles fine. Failing loudly at the first
      // drain beats a silent success that drops the write.
      throw new Error(`Outbox: no dispatcher for operation "${entry.operation}"`);
  }
}
