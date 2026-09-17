"use client";

import { applyEntryOutcome, readOutbox } from "./outbox";
import { isDue, isBlockedByPendingCreate, isOrphanedByFailedCreate, PIN_NEVER_CREATED_REASON } from "./schedule";
import type { SendOutcome } from "./schedule";
import type { OutboxEntry } from "./types";

/**
 * Reason recorded on a dependent write (`editPin`, `deleteOwnPin`,
 * `setPinRemoved`, `voteOnPin`) whose own pin's `createPin` has permanently
 * failed — the pin will never exist, so retrying cannot help. Matches what
 * `assertPinIsNotAwaitingCreate` used to throw a `PermanentFailure` for
 * (see Task 2's report, "Fix round 1"), now applied without ever reaching
 * the server: `isOrphanedByFailedCreate` already knows the create is
 * `stuck`, so there is nothing a request could learn that isn't already
 * known here.
 */
const PIN_NEVER_CREATED: SendOutcome = { result: "permanent", reason: PIN_NEVER_CREATED_REASON };

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
 * One drain at a time: concurrent drains would dispatch the same entry twice.
 *
 * Two variables rather than one, because they answer different questions at
 * different moments. `draining` is the gate, raised synchronously so no caller
 * can slip past it. `inFlight` is the handle, so a caller that WAS declined
 * can wait for the drain that declined it and then take its own turn — see
 * `flushOutbox`. `inFlight` is briefly null while `draining` is already true;
 * that window is exactly the synchronous stretch the gate exists to cover.
 */
let draining = false;
let inFlight: Promise<DrainResult> | null = null;

/**
 * Which entries a drain may send. Anything it declines is left exactly as it
 * is (not attempted, not marked) so the session it belongs to can send it.
 */
type EntryFilter = (entry: OutboxEntry) => boolean;

const EVERY_ENTRY: EntryFilter = () => true;

async function runDrain(
  dispatch: (entry: OutboxEntry) => Promise<SendOutcome>,
  delivered: OutboxEntry[],
  accept: EntryFilter
): Promise<DrainResult> {
  const result: DrainResult = { delivered: 0, failed: 0, skipped: false };

  // Every entry this call has already taken a turn on (dispatched, or
  // settled without dispatch — see the orphaned branch below). Two jobs:
  //
  // 1. The loop below re-reads the outbox after each pass, so a report filed
  //    while this drain was awaiting a round trip is picked up by the same
  //    drain instead of waiting for a reload or an "online" event. Without
  //    this set, an entry that fails transiently would be re-read and
  //    re-dispatched on every pass and the loop would never terminate.
  // 2. It bounds the call: the queue is finite and each entry is settled at
  //    most once here, so the loop always ends. A transient failure is left
  //    for the NEXT drain, which is what "transient" already meant.
  const attempted = new Set<string>();

  for (;;) {
    const now = new Date();
    // The full queue, not just what passed `accept`: isBlockedByPendingCreate
    // and isOrphanedByFailedCreate need to see a dependency's createPin entry
    // even when that create itself belongs to a different accept-filtered
    // subset (drainForCurrentSession filters by userId, but a pin and its
    // dependent edit/delete/vote always share one queuer, so this is never a
    // cross-session lookup in practice).
    const queue = readOutbox();

    // A dependent write (editPin/deleteOwnPin/setPinRemoved/voteOnPin) whose
    // own pin's createPin has already given up for good: the pin will never
    // exist, so this is settled as permanent WITHOUT ever calling dispatch
    // — there is no request worth making (Task 2's report, "What Task 4
    // must now call"). Settled before the due/blocked filter below, in the
    // same pass, so it never also shows up there: isBlockedByPendingCreate
    // and isOrphanedByFailedCreate are mutually exclusive by construction
    // (see schedule.ts), but `queue` here is a stale snapshot for the rest
    // of this pass, so each orphaned id is added to `attempted` immediately
    // to keep it out of `pending` below.
    const orphaned = queue.filter(
      (entry) =>
        entry.status === "pending" &&
        !attempted.has(entry.id) &&
        accept(entry) &&
        isOrphanedByFailedCreate(entry, queue)
    );
    for (const entry of orphaned) {
      attempted.add(entry.id);
      applyEntryOutcome(entry.id, PIN_NEVER_CREATED);
      result.failed += 1;
    }

    const pending = queue.filter(
      (entry) =>
        // status !== "pending" (stuck, held) is never due — see isDue.
        isDue(entry, now) &&
        // Wait behind a still-live createPin for the same pin rather than
        // attempting a write the server can only refuse (design doc,
        // "Queue order is respected"). Left exactly as it is: not attempted,
        // not marked, so a later drain — once the create has landed or
        // given up — can pick it up.
        !isBlockedByPendingCreate(entry, queue) &&
        !attempted.has(entry.id) &&
        accept(entry)
    );
    if (pending.length === 0) {
      // Orphaned entries were settled above even with nothing due; loop
      // again so the next pass re-reads the queue (now missing them) rather
      // than stopping mid-pass.
      if (orphaned.length === 0) break;
      continue;
    }

    for (const entry of pending) {
      attempted.add(entry.id);
      // dispatchQueued (and the sendEntry it wraps) never throws — a
      // network failure already maps to `{ result: "retry" }` — but one
      // misbehaving dispatcher (a test double, a future caller) must still
      // not strand every entry behind it in the queue.
      const outcome = await dispatch(entry).catch(
        (error): SendOutcome => ({
          result: "retry",
          error: error instanceof Error ? error.message : String(error),
        })
      );
      applyEntryOutcome(entry.id, outcome);
      if (outcome.result === "delivered") {
        delivered.push(entry);
        result.delivered += 1;
      } else {
        result.failed += 1;
      }
    }
  }

  return result;
}

export function drainOutbox(
  dispatch: (entry: OutboxEntry) => Promise<SendOutcome>,
  accept: EntryFilter = EVERY_ENTRY
): Promise<DrainResult> {
  if (draining) return Promise.resolve({ delivered: 0, failed: 0, skipped: true });

  // Raised BEFORE runDrain is invoked, which is the whole point. An async
  // function body runs synchronously up to its first `await`, and runDrain's
  // first await is `dispatch(entry)` — so a dispatcher that re-enters this
  // function before yielding would find `inFlight` still null and start a
  // second concurrent drain over the same queue. Today's dispatcher awaits a
  // dynamic import and cannot do that, but Plan 4 adds four more dispatchers
  // to this module, and a guard that only holds for the current caller is not
  // a guard. `inFlight` still exists, for flushOutbox to wait on; it is just
  // no longer what decides.
  draining = true;

  const delivered: OutboxEntry[] = [];

  const run = runDrain(dispatch, delivered, accept).finally(() => {
    draining = false;
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
  dispatch: (entry: OutboxEntry) => Promise<SendOutcome>,
  accept: EntryFilter = EVERY_ENTRY
): Promise<DrainResult> {
  const result = await drainOutbox(dispatch, accept);
  if (!result.skipped) return result;

  // The drain that declined us. It handles its own failures, so a rejection
  // here is not ours to act on — we only need to know it has finished.
  await inFlight?.catch(() => undefined);
  return drainOutbox(dispatch, accept);
}
