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
  /**
   * True when this call declined to run because another drain was already
   * in flight — `delivered`/`failed` are both 0 and tell you nothing about
   * the queue's actual contents. False on every drain that actually ran,
   * queue-empty included. Callers must check this before treating a zero
   * result as "queue empty, stop retrying".
   *
   * `flushOutbox` below is what honours that contract; production callers
   * should use it rather than calling `drainOutbox` directly.
   */
  skipped: boolean;
}

/**
 * Listeners notified after a drain in which at least one entry reached the
 * server, with the entries that reached it.
 *
 * `useServerReports` both refetches and holds those entries on this signal.
 * `markDelivered` withdraws the optimistic row the instant the server confirms
 * it, so without a replacement the resident watches their own successfully
 * delivered report disappear a second after filing it — success looking
 * identical to loss. The entries come with the notification because the
 * refetch is a round trip: on the connection this app assumes, "gone until the
 * fetch comes back" is still gone.
 *
 * Notified only when something was actually delivered, so a drain that
 * delivers nothing (an empty queue, an offline pass, a re-drain that found
 * nothing new) costs no network.
 */
type DeliveryListener = (delivered: OutboxEntry[]) => void;
const deliveryListeners = new Set<DeliveryListener>();

/** Subscribe to "these queued writes just reached the server". */
export function onDelivered(listener: DeliveryListener): () => void {
  deliveryListeners.add(listener);
  return () => {
    deliveryListeners.delete(listener);
  };
}

/**
 * The drain currently running, or null. One drain at a time: concurrent
 * drains would dispatch the same entry twice. Held as the promise rather than
 * a bare boolean so a caller that gets `skipped` can wait for the drain that
 * declined it and then take its own turn — see `flushOutbox`.
 */
let inFlight: Promise<DrainResult> | null = null;

async function runDrain(
  dispatch: (entry: OutboxEntry) => Promise<void>,
  delivered: OutboxEntry[]
): Promise<DrainResult> {
  const result: DrainResult = { delivered: 0, failed: 0, skipped: false };

  // Every entry this call has already taken a turn on. Two jobs:
  //
  // 1. The loop below re-reads the outbox after each pass, so a report filed
  //    while this drain was awaiting a round trip is picked up by the same
  //    drain instead of waiting for a reload or an "online" event. Without
  //    this set, an entry that fails transiently would be re-read and
  //    re-dispatched on every pass and the loop would never terminate.
  // 2. It bounds the call: the queue is finite and each entry is dispatched at
  //    most once here, so the loop always ends. A transient failure is left
  //    for the NEXT drain, which is what "transient" already meant.
  const attempted = new Set<string>();

  for (;;) {
    const pending = readOutbox().filter(
      // A permanent failure is never retried — an RLS denial or a CHECK
      // violation cannot become true later.
      (entry) => !entry.permanentlyFailed && !attempted.has(entry.id)
    );
    if (pending.length === 0) break;

    for (const entry of pending) {
      attempted.add(entry.id);
      try {
        await dispatch(entry);
        markDelivered(entry.id);
        delivered.push(entry);
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
  }

  return result;
}

export function drainOutbox(
  dispatch: (entry: OutboxEntry) => Promise<void>
): Promise<DrainResult> {
  if (inFlight) return Promise.resolve({ delivered: 0, failed: 0, skipped: true });

  const delivered: OutboxEntry[] = [];

  // `inFlight` is assigned synchronously, before any caller can run again:
  // runDrain executes up to its first `await` immediately and nothing on that
  // path re-enters drainOutbox.
  const run = runDrain(dispatch, delivered).finally(() => {
    inFlight = null;
  });
  inFlight = run;

  return run.then((result) => {
    if (delivered.length > 0) {
      for (const listener of deliveryListeners) listener(delivered);
    }
    return result;
  });
}

/**
 * Drains, and does not accept a declined drain as an answer.
 *
 * `skipped` means another drain was already in flight and this call's zeroes
 * say nothing about the queue. The in-flight drain now re-reads the queue
 * after every pass, so it will usually pick up whatever this caller queued —
 * but "usually" is not a contract, and a caller that shrugs at `skipped` is
 * how a report ends up sitting unsent for the rest of the session. So wait
 * for that drain and take a turn afterwards.
 *
 * One retry, not a loop: if a third drain has started by then, that drain is
 * itself subject to this same rule.
 */
export async function flushOutbox(
  dispatch: (entry: OutboxEntry) => Promise<void>
): Promise<DrainResult> {
  const result = await drainOutbox(dispatch);
  if (!result.skipped) return result;

  // The drain that declined us. It handles its own failures, so a rejection
  // here is not ours to act on — we only need to know it has finished.
  await inFlight?.catch(() => undefined);
  return drainOutbox(dispatch);
}
