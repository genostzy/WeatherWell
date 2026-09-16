import type { OutboxEntry, OutboxStatus, StuckReason } from "./types";

/**
 * The result of one send attempt against an outbox endpoint, mapped from the
 * response shape in the design doc (section 2 / "Worker endpoints"):
 * `delivered` (200), `held` (409 — a different user owns this session),
 * `signed_out` (401), `permanent` (422 — will never succeed), `retry`
 * (503 or a network failure — temporary).
 */
export type SendOutcome =
  | { result: "delivered" }
  | { result: "held" }
  | { result: "signed_out" }
  | { result: "permanent"; reason?: string }
  | { result: "retry"; error?: string };

/**
 * Minutes to wait before attempts 1 through 5 respectively; attempts beyond
 * the table's length keep waiting the table's last entry (60 minutes) rather
 * than growing further.
 */
export const BACKOFF_MINUTES = [0, 1, 5, 15, 60] as const;

/** An entry that has failed this many times gives up and becomes stuck. */
export const MAX_ATTEMPTS = 10;

/**
 * An entry still failing this long after it was queued gives up and becomes
 * stuck, regardless of its attempt count — a resident's report from three
 * days ago is not worth landing suddenly out of nowhere.
 */
export const GIVE_UP_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * A stuck entry older than this (from `queuedAt`) is deleted on the next
 * drain. Held entries are never pruned this way — see `shouldPrune`.
 */
export const PRUNE_STUCK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Operations that must not be sent while their pin's `createPin` is still
 * queued (design doc, "Queue order is respected"). `voteOnPin` is
 * deliberately excluded: a vote against a pin whose create has not landed
 * yet is a separate concern from Task 4's call-site migration, not this
 * module's — see the Task 2 report for how the pre-existing
 * `assertPinIsNotAwaitingCreate` differed here. `createPin` itself is never
 * blocked; nothing can be queued ahead of its own create.
 */
const BLOCKED_BY_PENDING_CREATE = new Set<OutboxEntry["operation"]>([
  "editPin",
  "deleteOwnPin",
  "setPinRemoved",
]);

/**
 * True when a `pending` entry's wait is over and it may be sent. A `stuck`
 * or `held` entry is never due — the former needs `retryStuck` first, the
 * latter needs its owner to sign back in.
 */
export function isDue(entry: OutboxEntry, now: Date): boolean {
  if (entry.status !== "pending") return false;
  return entry.nextAttemptAt === null || Date.parse(entry.nextAttemptAt) <= now.getTime();
}

/**
 * Applies one send result to a queued entry, returning the entry's next
 * state, or `null` when the entry should be deleted (delivered).
 *
 * Every branch that keeps the entry stamps `updatedAt` to `now`, so a page
 * reconciling its copy against the worker's can tell which one is newer.
 */
export function applyOutcome(entry: OutboxEntry, outcome: SendOutcome, now: Date): OutboxEntry | null {
  const updatedAt = now.toISOString();

  switch (outcome.result) {
    case "delivered":
      return null;

    case "held":
      return { ...entry, status: "held", nextAttemptAt: null, updatedAt };

    // Left for the page: the worker never creates or refreshes a session, so
    // it cannot tell a genuinely signed-out resident from one whose cookies
    // just have not reached it yet. Nothing else about the entry changes.
    case "signed_out":
      return { ...entry, updatedAt };

    case "permanent": {
      const stuckReason: StuckReason = outcome.reason === "too_old" ? "too_old" : "permanent";
      return {
        ...entry,
        status: "stuck",
        stuckReason,
        lastError: outcome.reason ?? "permanent",
        nextAttemptAt: null,
        updatedAt,
      };
    }

    case "retry": {
      const attempts = entry.attempts + 1;
      const age = now.getTime() - Date.parse(entry.queuedAt);
      if (attempts >= MAX_ATTEMPTS || age > GIVE_UP_AFTER_MS) {
        const stuckReason: StuckReason = "gave_up";
        return {
          ...entry,
          attempts,
          status: "stuck",
          stuckReason,
          lastError: outcome.error,
          nextAttemptAt: null,
          updatedAt,
        };
      }
      const minutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
      return {
        ...entry,
        attempts,
        status: "pending",
        lastError: outcome.error,
        nextAttemptAt: new Date(now.getTime() + minutes * 60_000).toISOString(),
        updatedAt,
      };
    }
  }
}

/**
 * A resident asking to retry a stuck entry: attempts and the stuck reason
 * are cleared, and it is due again immediately.
 */
export function retryStuck(entry: OutboxEntry, now: Date): OutboxEntry {
  const updatedAt = now.toISOString();
  const status: OutboxStatus = "pending";
  const retried: OutboxEntry = {
    ...entry,
    attempts: 0,
    status,
    nextAttemptAt: updatedAt,
    updatedAt,
  };
  delete retried.stuckReason;
  delete retried.lastError;
  return retried;
}

/**
 * True when a stuck entry is old enough (from `queuedAt`) to be dropped from
 * the queue outright. Held entries are excluded on purpose — the design doc
 * is explicit that a held entry is never auto-deleted, no matter its age,
 * because it is waiting on its owner rather than failing.
 */
export function shouldPrune(entry: OutboxEntry, now: Date): boolean {
  return entry.status === "stuck" && now.getTime() - Date.parse(entry.queuedAt) > PRUNE_STUCK_AFTER_MS;
}

/**
 * True when `entry` must wait behind a still-queued `createPin` for the same
 * pin. Mirrors `assertPinIsNotAwaitingCreate` (see `src/lib/community-pins.ts`):
 * a createPin entry's own outbox id IS the pin's row id, so "the same pin" is
 * an exact id match, not a heuristic. A create that has already given up
 * (`status === "stuck"`) no longer blocks anything — the pin will never
 * exist, so the dependent write should be failed rather than held forever;
 * turning that into a permanent failure is the caller's job, not this
 * predicate's.
 */
export function isBlockedByPendingCreate(entry: OutboxEntry, queue: readonly OutboxEntry[]): boolean {
  if (!BLOCKED_BY_PENDING_CREATE.has(entry.operation)) return false;
  const pinId = (entry.payload as { pinId?: string }).pinId;
  return queue.some((other) => other.operation === "createPin" && other.id === pinId && other.status !== "stuck");
}
