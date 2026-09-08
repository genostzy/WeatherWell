"use client";

import { markDelivered, markFailed, readOutbox } from "./outbox";
import type { OutboxEntry } from "./types";

/**
 * Thrown by a dispatcher when retrying cannot help — an RLS denial, a
 * validation rejection. Anything else is treated as transient and retried.
 */
export class PermanentFailure extends Error {}

export interface DrainResult {
  delivered: number;
  failed: number;
}

/** One drain at a time: concurrent drains would dispatch the same entry twice. */
let draining = false;

export async function drainOutbox(
  dispatch: (entry: OutboxEntry) => Promise<void>
): Promise<DrainResult> {
  if (draining) return { delivered: 0, failed: 0 };
  draining = true;

  const result: DrainResult = { delivered: 0, failed: 0 };
  try {
    for (const entry of readOutbox()) {
      if (entry.permanentlyFailed) continue;
      try {
        await dispatch(entry);
        markDelivered(entry.id);
        result.delivered += 1;
      } catch (error) {
        // One entry failing must not strand the ones behind it.
        markFailed(
          entry.id,
          error instanceof Error ? error.message : String(error),
          error instanceof PermanentFailure
        );
        result.failed += 1;
      }
    }
  } finally {
    draining = false;
  }
  return result;
}
