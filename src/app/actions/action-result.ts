/**
 * What every Server Action in this app answers with.
 *
 * The shape exists for the outbox rather than for the UI. `drainOutbox` needs
 * exactly one bit from a failed write — can retrying help — because it acts on
 * that bit twice over: a permanent failure is skipped forever AND dropped from
 * the optimistic merge, while a transient one stays queued and stays on
 * screen. Getting that bit wrong in either direction is a resident's report
 * silently lost or a refused write shown as sent, so it is carried explicitly
 * instead of being inferred from an error message at the call site.
 *
 * Declared here, not beside any one action, because Tasks 3-6 add five more
 * actions across four files and a per-file copy of a discriminated union is a
 * per-file opportunity for the two halves to drift.
 *
 * `error` is a diagnostic string for the queue's `lastError`, not user-facing
 * copy: nothing in the UI surfaces a queued write's failure state yet.
 */
export type ActionResult = { ok: true } | { ok: false; permanent: boolean; error: string };
