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
  | { result: "retry"; error?: string; reason?: string };

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
 * Operations that reference an existing pin by id and so must not race their
 * pin's own `createPin` (design doc, "Queue order is respected"). A vote is
 * held back exactly like an edit, a delete or a moderation: a vote on a pin
 * the server does not have yet can only be refused. `createPin` itself is
 * never one of these; nothing can be queued ahead of its own create.
 */
const DEPENDS_ON_PIN_CREATE = new Set<OutboxEntry["operation"]>([
  "editPin",
  "deleteOwnPin",
  "setPinRemoved",
  "voteOnPin",
]);

/**
 * The reason recorded on a dependent write whose `createPin` gave up: the pin
 * will never exist, so the dependent is settled as permanent without being
 * sent. `public/sw.js` restates it as OUTBOX_PIN_NEVER_CREATED.
 */
export const PIN_NEVER_CREATED_REASON = "pin was never created";

/**
 * The queued `createPin` entry `entry` depends on, if any. A createPin
 * entry's own outbox id IS the pin's row id (the route passes the entry id
 * to `createPin` as the row's id), so this is an exact id match, not a
 * heuristic. It searches the whole `queue` the caller passes in; the caller
 * passes the queue that actually matters (the page's outbox, or the
 * worker's IndexedDB copy).
 */
function findDependencyCreate(
  entry: OutboxEntry,
  queue: readonly OutboxEntry[]
): OutboxEntry | undefined {
  if (!DEPENDS_ON_PIN_CREATE.has(entry.operation)) return undefined;
  // Guarded exactly as the worker's copy is: `normalize` does not validate
  // `payload`, and a malformed or legacy entry with none must not throw
  // inside every drain.
  const payload = entry.payload as { pinId?: unknown } | null | undefined;
  const pinId = payload ? payload.pinId : undefined;
  return queue.find((other) => other.operation === "createPin" && other.id === pinId);
}

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

    // Every outcome but a rate-limited retry clears waitReason: it says why an
    // entry waits, and none of these wait for that.
    case "held":
      return { ...entry, status: "held", waitReason: null, nextAttemptAt: null, updatedAt };

    // Left for the page: the worker never creates or refreshes a session, so
    // it cannot tell a genuinely signed-out resident from one whose cookies
    // just have not reached it yet. A brief sign-out must not burn attempts,
    // so this never counts toward MAX_ATTEMPTS — but it does count toward
    // the 3-day give-up, or a device whose refresh token has died would show
    // "Will send when online" forever. Past that, it is stuck like any other
    // write that has waited too long, and the resident can Retry it.
    case "signed_out": {
      const age = now.getTime() - Date.parse(entry.queuedAt);
      if (age > GIVE_UP_AFTER_MS) {
        const stuckReason: StuckReason = "gave_up";
        return {
          ...entry,
          status: "stuck",
          stuckReason,
          lastError: "signed_out",
          waitReason: null,
          nextAttemptAt: null,
          updatedAt,
        };
      }
      return { ...entry, waitReason: null, updatedAt };
    }

    case "permanent": {
      const stuckReason: StuckReason =
        outcome.reason === "too_old" || outcome.reason === "too_far" ? outcome.reason : "permanent";
      return {
        ...entry,
        status: "stuck",
        stuckReason,
        lastError: outcome.reason ?? "permanent",
        waitReason: null,
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
          waitReason: null,
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
        waitReason: outcome.reason === "rate_limited" ? "rate_limited" : null,
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
  delete retried.waitReason;
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
 * True when `entry` must wait behind a still-queued, still-live `createPin`
 * for the same pin: its create was found and has not (yet) permanently
 * failed. False once that create is `stuck` — see
 * `isOrphanedByFailedCreate` for that branch instead, so the two never
 * overlap: blocked means "wait", orphaned means "give up".
 */
export function isBlockedByPendingCreate(entry: OutboxEntry, queue: readonly OutboxEntry[]): boolean {
  const create = findDependencyCreate(entry, queue);
  return create !== undefined && create.status !== "stuck";
}

/**
 * True when `entry` depends on a pin whose `createPin` has already given up
 * (`status === "stuck"`): the pin will never exist, so the dependent write
 * should fail permanently rather than wait forever or be sent to a server
 * that can only refuse it. Both drains (drain.ts and public/sw.js) settle
 * an entry this returns true for with `PIN_NEVER_CREATED_REASON`, in place
 * of sending it.
 */
export function isOrphanedByFailedCreate(entry: OutboxEntry, queue: readonly OutboxEntry[]): boolean {
  const create = findDependencyCreate(entry, queue);
  return create !== undefined && create.status === "stuck";
}

/**
 * True when `entry` is a dependent write that was settled as stuck ONLY
 * because `create` had given up — see `isOrphanedByFailedCreate` and
 * `PIN_NEVER_CREATED_REASON`. When the resident retries that create, these
 * go back to pending with it: otherwise a create that then lands leaves, for
 * example, a stuck delete behind, and the pin the resident deleted comes
 * back. A dependent the server itself refused keeps its own stuck state.
 */
export function wasOrphanedBy(entry: OutboxEntry, create: OutboxEntry): boolean {
  return (
    create.operation === "createPin" &&
    entry.status === "stuck" &&
    entry.stuckReason === "permanent" &&
    entry.lastError === PIN_NEVER_CREATED_REASON &&
    findDependencyCreate(entry, [create]) !== undefined
  );
}
