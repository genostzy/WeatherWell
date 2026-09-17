# V0 Offline Sending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Queued writes send even with the app closed, where Background Sync exists. They carry the time they were made, stop retrying sensibly, never cross accounts on a shared phone, and are visible to the person who made them.

**Architecture:**
- **Queue:** the page keeps its synchronous `localStorage` queue, and every change is mirrored to IndexedDB.
- **Sending:** the service worker drains IndexedDB on Background Sync by POSTing to `/api/outbox/<operation>`. That route checks ownership server-side, then calls the existing Server Action function. The page drains through the same route.
- **Retry rules:** these live in `schedule.ts`, and are duplicated in `sw.js` against one shared JSON case table.
- **Honest times:** enforced by database triggers.

**Tech Stack:** Next.js 16.3.4, Supabase Postgres, IndexedDB, Background Sync API, Vitest, `fake-indexeddb` (new devDependency, tests only).

**Spec:** `docs/superpowers/specs/2026-09-16-v0-offline-sending-design.md`. Read the whole spec, including the two amendments made during planning.

## Global Constraints

- **Framework:** Next.js 16.3.4 differs from training data. Read `node_modules/next/dist/docs/` before writing a route or page. `params` in a dynamic route handler is a Promise.
- **Keys and trust:** never import a secret or service-role key into `src/`. Server trust uses `getClaims()`, never `getSession()`.
- **Supabase rules:**
  - Never create a Supabase branch.
  - Never revoke EXECUTE from `authenticated` on `private.is_operator` / `private.manages_zone`.
  - No SECURITY INVOKER plpgsql function may reference `private.*`.
  - Definer functions pin `set search_path = ''`.
- **Live database:** it is shared and at a clean baseline (users 0, profiles 0, official_actions 0, alerts 0, reports 0, pins 0, check-ins 0, app_errors 0, zones 4, centres 4 with 0 occupancy, municipalities 4, hazards 12, POIs 6). It must end at that baseline. Never write to zone-1..zone-4 outside the rolled-back suite; live tests use a temporary zone they create and delete.
- **Database suite:** there is no local Postgres. Use the Supabase MCP `execute_sql` / `apply_migration`. Run `helpers.sql` in one call, then `reference-tables.sql` + `rls.sql` concatenated in one call; it must reach `rollback;` with no TSTFL.
- **Idempotency:** every queued write is idempotent by its entry id. Any ambiguity resolves to sending again.
- **Service worker:**
  - It never calls Supabase directly.
  - It never creates, refreshes or reads a session.
  - It never sends an entry with `userId` null.
  - It never deletes a held entry.
  - It never caches `/api/outbox/*`.
- **Copy:** user-facing strings are bilingual and use the exact spec wording (spec section 3).
- **Gates:** all five exit 0 before each commit: `npm test`, `npm run typecheck`, `npm run lint`, `npm run knip`, `npm run build`. The baseline is 851 tests; the count never drops without naming each removed test.
- **Git:** stage named files only, never `git add .`. `.claude-sessions/` and `supabase/.temp/` stay untracked. Do not push.
- **Commit trailer**, after a blank line: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

### Task 1: Honest times in the database and the actions

**Files:**
- Create: `supabase/migrations/<ts>_honest_write_times.sql`. The timestamp must sort after `20260915094819_app_errors.sql`.
- Modify:
  - `supabase/tests/rls.sql` (append before `rollback;`)
  - `src/app/actions/action-result.ts`
  - `src/app/actions/submit-water-level-report.ts` (+ test)
  - `src/app/actions/record-check-in.ts` (+ test)
  - `src/lib/supabase/database.types.ts` (only if generated types change)

**Interfaces:**
- Produces:
  - `type ActionResult = { ok: true } | { ok: false; permanent: boolean; error: string; reason?: "too_old" }`
  - `SubmitReportInput` gains `madeAt?: string` (ISO); `RecordCheckInInput` gains `madeAt?: string`.

- [ ] **Step 1: Write the failing database assertions.** Append to `rls.sql`, using the existing resident fixture `66666666-6666-6666-6666-666666666666` and an existing fixture zone (read the file for one it inserts; use a fixture zone, never zone-1..4):

```sql
-- Honest write times: a queued write keeps the time it was made.
select tests.as_user('66666666-6666-6666-6666-666666666666');
select tests.expect_allowed('H1: a 5-hour-old report is kept with its own time',
  $$insert into public.water_level_reports (id, zone_id, depth_level, reporter_id, reported_at)
    values ('a0000000-0000-4000-8000-000000000001', '<fixture zone>', 'knee',
            '66666666-6666-6666-6666-666666666666', now() - interval '5 hours')$$);
select tests.expect_row_count('H2: its reported_at is the made-at time, not arrival',
  $$select 1 from public.water_level_reports
     where id = 'a0000000-0000-4000-8000-000000000001'
       and reported_at between now() - interval '5 hours 1 minute' and now() - interval '4 hours 59 minutes'$$, 1);
select tests.expect_row_count('H3: a future reported_at is clamped to now',
  $$with ins as (insert into public.water_level_reports (id, zone_id, depth_level, reporter_id, reported_at)
       values ('a0000000-0000-4000-8000-000000000002', '<fixture zone>', 'ankle',
               '66666666-6666-6666-6666-666666666666', now() + interval '2 days') returning reported_at)
    select 1 from ins where reported_at = now()$$, 1);
```

`H4`: a 7-hour-old report raises SQLSTATE `22023` with message `report too old`. Write this as a do-block that switches role the same way the file's existing role-switching do-blocks do, catches `sqlstate '22023'`, and raises `TSTFL` if no exception occurred. `tests.expect_denied` only catches insufficient_privilege.

Add check-in cases, again via do-blocks where a row must be inspected:
- `H5`: a check-in with `checked_in_at = now() - interval '9 hours'` is kept with that time.
- `H6`: a future `checked_in_at` is clamped to `now()`.
- `H7`: after a check-in stored at `now() - interval '1 hour'` with status `safe`, an upsert on the same `(zone_id, user_id)` with `checked_in_at = now() - interval '3 hours'` and status `needs_help` leaves status `safe` and time `now() - interval '1 hour'`.
- `H8`: an upsert with a newer time than the stored one does update the status.
- `H9`: an insert with no `reported_at` gets `now()`.

- [ ] **Step 2: Run the suite and confirm the failure.** The first failure should be at H1: a permission denied on column `reported_at`, or the time is not kept.

- [ ] **Step 3: Write and apply the migration.**

```sql
-- A queued write keeps the time it was made (spec §2).
grant insert (reported_at) on public.water_level_reports to authenticated;
grant insert (checked_in_at) on public.evacuation_check_ins to authenticated;
grant update (checked_in_at) on public.evacuation_check_ins to authenticated;

create or replace function private.honest_report_time()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reported_at is null or new.reported_at > now() then
    new.reported_at := now();
  elsif new.reported_at < now() - interval '6 hours' then
    raise exception 'report too old' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger water_level_reports_honest_time
  before insert on public.water_level_reports
  for each row execute function private.honest_report_time();

create or replace function private.honest_check_in_time()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.checked_in_at is null or new.checked_in_at > now() then
    new.checked_in_at := now();
  end if;
  -- An older check-in arriving late never replaces a newer one.
  if tg_op = 'UPDATE' and new.checked_in_at < old.checked_in_at then
    return old;
  end if;
  return new;
end $$;
create trigger evacuation_check_ins_honest_time
  before insert or update on public.evacuation_check_ins
  for each row execute function private.honest_check_in_time();
```

**Verify these, then adjust only as the facts require:**
- Read the latest migrations that grant on these tables (`20260909120345_task2_review_fixes.sql`, `20260907073646_harden_write_paths.sql`, `20260908084522_report_client_ids.sql`), to confirm the current column grants and whether `reported_at` needs its own grant.
- Check whether an `upsert` from PostgREST reaches the UPDATE trigger with `old` populated. It does when the conflict path updates.

Save the identical SQL as the migration file.

- [ ] **Step 4: Run the suite until it passes, then prove H4 and H7 bite.** In `begin; … rollback;` inside one `execute_sql` call, remove the age check and see H4 raise; then remove the older-than guard and see H7 raise. Afterwards, confirm with `pg_get_functiondef` that the live functions match the file.

- [ ] **Step 5: Write the failing action tests.** Follow the existing tests' mocks.
  - `submit-water-level-report.test.ts`:
    - with `madeAt: "2026-09-16T02:00:00.000Z"`, the insert payload includes `reported_at` with that value;
    - without `madeAt`, no `reported_at` key is sent;
    - a Supabase error `{ code: "22023", message: "report too old" }` returns `{ ok: false, permanent: true, reason: "too_old", error: "report too old" }`.
  - `record-check-in.test.ts`:
    - with `madeAt`, the upsert payload includes `checked_in_at`;
    - without it, no `checked_in_at` key is sent.

- [ ] **Step 6: Implement the changes, then run the tests and five gates.**
  - Add `madeAt?: string` to both inputs.
  - Spread `...(input.madeAt ? { reported_at: input.madeAt } : {})` (and the same for `checked_in_at`).
  - In the report action, map code `22023` to the too-old result before the existing classification.
  - Add the optional `reason` to `ActionResult`.

- [ ] **Step 7: Commit** the migration, `rls.sql`, both actions and their tests, `action-result.ts`, and the types file if changed, with the message `feat(outbox): queued reports and check-ins keep the time they were made`.

---

### Task 2: The retry schedule and its shared case table

**Files:**
- Create: `src/lib/outbox/schedule.ts`, `src/lib/outbox/schedule.test.ts`, `src/lib/outbox/schedule-cases.json`
- Modify: `src/lib/outbox/types.ts`

**Interfaces:**
- Produces, in `types.ts`, an `OutboxEntry` that becomes:

```ts
export type OutboxStatus = "pending" | "stuck" | "held";
export type StuckReason = "permanent" | "too_old" | "gave_up";
export interface OutboxEntry {
  id: string;
  operation: OutboxOperation;
  payload: OutboxPayloads[OutboxOperation];
  queuedAt: string;
  attempts: number;
  userId?: string | null;
  status: OutboxStatus;
  nextAttemptAt: string | null;
  updatedAt: string;
  lastError?: string;
  stuckReason?: StuckReason;
}
```

`permanentlyFailed` is removed. Task 3 migrates stored entries; `status === "stuck"` replaces every `permanentlyFailed` read.

- Produces, in `schedule.ts`:

```ts
export type SendOutcome =
  | { result: "delivered" }
  | { result: "held" }
  | { result: "signed_out" }
  | { result: "permanent"; reason?: string }
  | { result: "retry"; error?: string };

export const BACKOFF_MINUTES: readonly number[]; // [0, 1, 5, 15, 60]
export const MAX_ATTEMPTS: number;                // 10
export const GIVE_UP_AFTER_MS: number;            // 3 days
export const PRUNE_STUCK_AFTER_MS: number;        // 7 days

export function isDue(entry: OutboxEntry, now: Date): boolean;
export function applyOutcome(entry: OutboxEntry, outcome: SendOutcome, now: Date): OutboxEntry | null; // null = delete
export function retryStuck(entry: OutboxEntry, now: Date): OutboxEntry;
export function shouldPrune(entry: OutboxEntry, now: Date): boolean;
export function isBlockedByPendingCreate(entry: OutboxEntry, queue: readonly OutboxEntry[]): boolean;
```

- [ ] **Step 1: Write `schedule-cases.json`.** It is an array of `{ name, entry, outcome, now, expect }`, where `expect` is either `null` (deleted) or the fields that must match. It is the single source of truth for both implementations and must include at least:
  1. delivered: `null`
  2. retry at attempts 0 at T: attempts 1, pending, `nextAttemptAt` T+0
  3. retry at attempts 1: attempts 2, T+1 minute
  4. retry at attempts 2: T+5 minutes
  5. retry at attempts 3: T+15 minutes
  6. retry at attempts 4: T+60 minutes
  7. retry at attempts 7: T+60 minutes
  8. retry reaching attempts 10: stuck, `gave_up`
  9. retry when `queuedAt` is 3 days + 1 minute before T: stuck, `gave_up`
  10. permanent `too_old`: stuck, `too_old`, `lastError` "too_old"
  11. permanent with another reason: stuck, `permanent`, `lastError` = reason
  12. held: status `held`, attempts unchanged, `nextAttemptAt` null
  13. signed_out: unchanged except `updatedAt` (left for the page)

  Every non-null result has `updatedAt` = T.

  Also add an `isDue` table (pending and nextAttemptAt ≤ now is due; a future nextAttemptAt, stuck or held is not due), a `shouldPrune` table (stuck and queued 7 days + 1 minute ago is pruned; stuck at 6 days is not; held at 30 days is never), and an `isBlockedByPendingCreate` table (an `editPin` whose `pinId` equals a queued `createPin` id is blocked; a `voteOnPin` is never blocked; a `createPin` is never blocked; an edit for a pin with no queued create is not blocked).

- [ ] **Step 2: Write `schedule.test.ts`.** Iterate every case in the JSON and assert with `toMatchObject` (or `toBeNull`). Add one explicit test that `retryStuck` resets attempts to 0, status to pending and nextAttemptAt to now, and clears `stuckReason`/`lastError`.

- [ ] **Step 3: Run it and confirm it fails** (the module is missing).

- [ ] **Step 4: Implement `schedule.ts`.**

```ts
import type { OutboxEntry } from "./types";

export type SendOutcome =
  | { result: "delivered" }
  | { result: "held" }
  | { result: "signed_out" }
  | { result: "permanent"; reason?: string }
  | { result: "retry"; error?: string };

export const BACKOFF_MINUTES = [0, 1, 5, 15, 60] as const;
export const MAX_ATTEMPTS = 10;
export const GIVE_UP_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
export const PRUNE_STUCK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const ORDERED_ON_CREATE = new Set(["editPin", "deleteOwnPin", "setPinRemoved"]);

export function isDue(entry: OutboxEntry, now: Date): boolean {
  return entry.status === "pending" && (entry.nextAttemptAt === null || Date.parse(entry.nextAttemptAt) <= now.getTime());
}

export function applyOutcome(entry: OutboxEntry, outcome: SendOutcome, now: Date): OutboxEntry | null {
  const updatedAt = now.toISOString();
  switch (outcome.result) {
    case "delivered":
      return null;
    case "held":
      return { ...entry, status: "held", nextAttemptAt: null, updatedAt };
    case "signed_out":
      return { ...entry, updatedAt };
    case "permanent": {
      const tooOld = outcome.reason === "too_old";
      return {
        ...entry,
        status: "stuck",
        stuckReason: tooOld ? "too_old" : "permanent",
        lastError: outcome.reason ?? "permanent",
        nextAttemptAt: null,
        updatedAt,
      };
    }
    case "retry": {
      const attempts = entry.attempts + 1;
      const age = now.getTime() - Date.parse(entry.queuedAt);
      if (attempts >= MAX_ATTEMPTS || age > GIVE_UP_AFTER_MS) {
        return { ...entry, attempts, status: "stuck", stuckReason: "gave_up", lastError: outcome.error, nextAttemptAt: null, updatedAt };
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

export function retryStuck(entry: OutboxEntry, now: Date): OutboxEntry {
  const { stuckReason: _s, lastError: _l, ...rest } = entry;
  return { ...rest, attempts: 0, status: "pending", nextAttemptAt: now.toISOString(), updatedAt: now.toISOString() };
}

export function shouldPrune(entry: OutboxEntry, now: Date): boolean {
  return entry.status === "stuck" && now.getTime() - Date.parse(entry.queuedAt) > PRUNE_STUCK_AFTER_MS;
}

export function isBlockedByPendingCreate(entry: OutboxEntry, queue: readonly OutboxEntry[]): boolean {
  if (!ORDERED_ON_CREATE.has(entry.operation)) return false;
  const pinId = (entry.payload as { pinId?: string }).pinId;
  return queue.some((other) => other.operation === "createPin" && other.id === pinId && other.status !== "stuck");
}
```

Case 7 says attempts 7 waits 60 minutes, consistent with `Math.min` over the table. A retry landing exactly on attempt 10 is stuck, per case 8. If a case and the code disagree, fix the code, never the case: the cases are the spec.

- [ ] **Step 5: Update `types.ts`.** Update it as shown above, then run `npm run typecheck`. Every error it reports is a `permanentlyFailed` use; leave them for Task 3 and list them. **Do not commit a failing typecheck.** Instead, in `types.ts` keep `permanentlyFailed?: boolean` marked `/** @deprecated removed in Task 3 */` for this commit only, so the gates stay green.

- [ ] **Step 6: Run the tests and five gates, then commit** `schedule.ts`, its test, the JSON and `types.ts`, with the message `feat(outbox): one retry schedule, specified as a shared case table`.

---

### Task 3: The queue store (page copy + IndexedDB mirror)

**Files:**
- Create: `src/lib/outbox/idb.ts`, `src/lib/outbox/idb.test.ts`
- Modify:
  - `src/lib/outbox/outbox.ts` (+ `outbox.test.ts`)
  - `src/lib/outbox/drain.ts` (+ test)
  - `src/lib/outbox/session-drain.ts`
  - `src/lib/outbox/identity-binding.test.ts`
  - every `permanentlyFailed` reader:
    - `src/lib/community-pins.ts`
    - `src/lib/water-level-reports.ts`
    - `src/lib/evacuation-checkins.ts`
    - `src/features/admin/admin-map-canvas.tsx`
    - `src/features/admin/community-pin-moderation-panel.tsx`
    - any other that `grep -rn permanentlyFailed src` finds
  - `types.ts` (drop the deprecated field)
  - `package.json` (devDependency `fake-indexeddb`)
  - `vitest.setup.ts` (import `fake-indexeddb/auto`)

**Interfaces:**
- Consumes: `OutboxEntry`, `applyOutcome`, `retryStuck`, `shouldPrune` (Task 2)
- Produces in `idb.ts`:
  - `openOutboxDb(): Promise<IDBDatabase>`
  - `idbGetAll(): Promise<OutboxEntry[]>`
  - `idbPut(entry: OutboxEntry): Promise<void>`
  - `idbDelete(id: string): Promise<void>`
  - the constants `OUTBOX_DB = "weatherwell"`, `OUTBOX_STORE = "outbox"`, `OUTBOX_CHANNEL = "weatherwell-outbox"`
- Produces in `outbox.ts` (existing names kept):
  - `enqueue`, `readOutbox`, `useOutbox`, `markDelivered(id)`, `claimUnattributed(userId)`
  - `applyEntryOutcome(id: string, outcome: SendOutcome): void`, which replaces `markFailed` (keep `markFailed` as a thin wrapper if tests elsewhere use it, or update those tests)
  - `retryEntry(id: string): void`
  - `discardEntry(id: string): void`
  - `reconcileWithMirror(): Promise<void>`

- [ ] **Step 1: Install the test dependency.** `npm install --save-dev fake-indexeddb`, then add `import "fake-indexeddb/auto";` at the top of `vitest.setup.ts`.

- [ ] **Step 2: Write the failing tests.**
  - **`idb.test.ts`:** put then getAll round-trips; delete removes; `openOutboxDb` creates store `outbox` keyed by `id`.
  - **`outbox.test.ts`,** extending the existing file:
    1. `enqueue` stores `status: "pending"`, `nextAttemptAt: null`, `attempts: 0`, and `updatedAt` = `queuedAt`, and mirrors to IndexedDB (await a tick, then `idbGetAll` contains it).
    2. `enqueue` still throws `OutboxWriteFailed` when `localStorage.setItem` throws.
    3. **Legacy migration:** a stored legacy entry `{ permanentlyFailed: true, ... }` reads as `status: "stuck", stuckReason: "permanent"`; `permanentlyFailed: false` reads as `pending`; a missing `userId` stays as it was.
    4. **Mirror wins on status:** an IndexedDB entry with a newer `updatedAt` and `status: "held"` replaces the page copy.
    5. **A page entry missing from IndexedDB** is re-put into IndexedDB and kept pending. It is never dropped: resending is safe.
    6. **An IndexedDB entry missing from the page copy** is added to the page copy.
    7. A `BroadcastChannel("weatherwell-outbox")` message `{ type: "changed" }` makes `useOutbox` re-render with IndexedDB's state (post from a second channel instance in the test).
    8. `applyEntryOutcome(id, { result: "delivered" })` removes the entry from both copies.
    9. `retryEntry` turns a stuck entry pending with attempts 0; `discardEntry` removes it from both copies.
    10. Stuck entries older than 7 days are pruned by `reconcileWithMirror`.

- [ ] **Step 3: Run them and confirm they fail.**

- [ ] **Step 4: Implement `idb.ts`.** Promise wrappers over `indexedDB.open(OUTBOX_DB, 1)`, creating `OUTBOX_STORE` with `keyPath: "id"` in `onupgradeneeded`. Every function resolves (never rejects) when `indexedDB` is undefined, so SSR and old browsers degrade to page-only.

- [ ] **Step 5: Rewrite the internals of `outbox.ts`,** keeping its public API.
  - `normalize(raw)` converts legacy entries (`permanentlyFailed` → status/stuckReason; defaults `nextAttemptAt: null`, `updatedAt: queuedAt`).
  - Every write goes through one `commit(next: OutboxEntry[], changedIds, deletedIds)`. It writes `localStorage` synchronously exactly as today (so `OutboxWriteFailed` detection is unchanged), then fire-and-forget `idbPut` / `idbDelete` for the changed ids, then posts `{ type: "changed" }` on the channel.
  - `reconcileWithMirror()`:
    1. read both copies;
    2. union by id;
    3. for an id in both, keep the greater `updatedAt`;
    4. an id only on the page is re-put to IndexedDB;
    5. an id only in IndexedDB is added to the page;
    6. prune with `shouldPrune`;
    7. commit.
  - Call it once on module load in the browser (guard `typeof window`) and on every channel message.
  - `markDelivered`, `applyEntryOutcome`, `retryEntry` and `discardEntry` use `applyOutcome` / `retryStuck` and commit.

- [ ] **Step 6: Replace every `permanentlyFailed` read** with `status === "stuck"`, then remove the deprecated field. Keep each call site's meaning.
  - In `community-pins.ts` / `water-level-reports.ts` / `evacuation-checkins.ts`, a stuck entry drops out of the optimistic merge as before.
  - Held entries do not appear in the current person's optimistic merge. Filter by `entry.userId === knownSessionUserId() || entry.userId === null`, closing spec seam M13, and add a test for it in `identity-binding.test.ts`.
  - `drain.ts`: select entries with `isDue(entry, now)` and `!isBlockedByPendingCreate(entry, queue)`, and settle each through `applyEntryOutcome`. The dispatcher signature changes in Task 4; for this task, keep `dispatch(entry): Promise<void>`, mapping a resolved dispatch to `delivered`, `PermanentFailure` to `permanent` (use `error.message` as the reason), and any other throw to `retry`.

- [ ] **Step 7: Run the tests and five gates, then commit** the files listed above, with the message `feat(outbox): mirror the queue into IndexedDB with status, backoff and pruning`.

---

### Task 4: `/api/outbox/[operation]` and the page draining through it

**Files:**
- Create: `src/app/api/outbox/[operation]/route.ts`, `src/app/api/outbox/[operation]/route.test.ts`, `src/lib/outbox/send.ts`, `src/lib/outbox/send.test.ts`
- Modify: `src/lib/outbox/dispatchers.ts` (+ test), `src/lib/outbox/session-drain.ts`, `src/lib/outbox/drain.ts`

**Interfaces:**
- Consumes: the Server Action functions `submitWaterLevelReport`, `createPin`, `editPin`, `deleteOwnPin`, `setPinRemoved` (`src/app/actions/pins.ts`), `voteOnPin`, `recordCheckIn`; `SendOutcome` (Task 2); `ActionResult.reason` (Task 1)
- Produces:
  - `POST /api/outbox/[operation]`, taking body `{ id, userId, queuedAt, payload }` and answering with the spec's status table;
  - `sendEntry(entry: OutboxEntry): Promise<SendOutcome>` (browser);
  - `dispatchQueued` now returns `Promise<SendOutcome>`.

- [ ] **Step 1: Write `route.test.ts`.** Mock `@/lib/supabase/user-server` so that `auth.getClaims` is configurable, and mock each action module. Cases:
  - An unknown operation returns 404 `{ result: "permanent", reason: "unknown_operation" }`.
  - A body missing `id` or `payload` returns 422 `{ result: "permanent", reason: "invalid" }`.
  - No claims: 401 `{ result: "signed_out" }`, and no action is called.
  - `userId` differs from `claims.sub`: 409 `{ result: "held" }`, and no action is called.
  - `userId` null: 409 `{ result: "held" }`. Unowned entries go through the page's claim step first.
  - `submitWaterLevelReport` ok: 200 `{ result: "delivered" }`, and the action is called with `{ id, ...payload, madeAt: queuedAt }`.
  - `recordCheckIn` is called with `madeAt: queuedAt`; the pin and vote actions are called **without** `madeAt`.
  - Action `{ ok: false, permanent: true, reason: "too_old" }`: 422 `{ result: "permanent", reason: "too_old" }`.
  - Action `{ ok: false, permanent: true, error: "x" }`: 422 `{ result: "permanent", reason: "x" }`.
  - Action `{ ok: false, permanent: false }`: 503 `{ result: "retry" }`.
  - An action throwing: 503 `{ result: "retry" }`, with no error text in the body.
  - Every response has `Cache-Control: no-store`.
  - The source never calls `getSession`: grep the file in a test (`readFileSync`) and expect no `getSession(`.

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Implement the route.** Read the dynamic-route docs for `params` in this Next version first.

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "@/app/actions/action-result";

const HEADERS = { "Cache-Control": "no-store" };
const reply = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: HEADERS });

type Runner = (id: string, payload: Record<string, unknown>, queuedAt: string) => Promise<ActionResult>;

const RUNNERS: Record<string, Runner> = {
  submitWaterLevelReport: async (id, p, madeAt) =>
    (await import("@/app/actions/submit-water-level-report")).submitWaterLevelReport({ id, ...(p as never), madeAt }),
  recordCheckIn: async (id, p, madeAt) =>
    (await import("@/app/actions/record-check-in")).recordCheckIn({ id, ...(p as never), madeAt }),
  createPin: async (id, p) => (await import("@/app/actions/pins")).createPin({ id, ...(p as never) }),
  editPin: async (_id, p) => (await import("@/app/actions/pins")).editPin(p as never),
  deleteOwnPin: async (_id, p) => (await import("@/app/actions/pins")).deleteOwnPin(p as never),
  setPinRemoved: async (_id, p) => (await import("@/app/actions/pins")).setPinRemoved(p as never),
  voteOnPin: async (_id, p) => (await import("@/app/actions/vote-on-pin")).voteOnPin(p as never),
};

/**
 * The queue's one way in, for the page and the service worker alike. The
 * server checks the entry belongs to whoever is signed in right now — so a
 * shared phone or a stale tab can never send one person's write as another's —
 * then runs the same Server Action code a direct call runs.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ operation: string }> }) {
  const { operation } = await params;
  const run = RUNNERS[operation];
  if (!run) return reply(404, { result: "permanent", reason: "unknown_operation" });

  let body: { id?: unknown; userId?: unknown; queuedAt?: unknown; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply(422, { result: "permanent", reason: "invalid" });
  }
  if (typeof body.id !== "string" || typeof body.payload !== "object" || body.payload === null) {
    return reply(422, { result: "permanent", reason: "invalid" });
  }

  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return reply(401, { result: "signed_out" });
  if (body.userId !== sub) return reply(409, { result: "held" });

  try {
    const queuedAt = typeof body.queuedAt === "string" ? body.queuedAt : new Date().toISOString();
    const result = await run(body.id, body.payload as Record<string, unknown>, queuedAt);
    if (result.ok) return reply(200, { result: "delivered" });
    if (result.permanent) return reply(422, { result: "permanent", reason: result.reason ?? result.error });
    return reply(503, { result: "retry" });
  } catch {
    return reply(503, { result: "retry" });
  }
}
```

Match the route handler's second-argument type to what this Next version documents. Check whether calling a `"use server"` function from a route handler is supported in `node_modules/next/dist/docs/`. If it is not, stop and report it: the architecture depends on it.

- [ ] **Step 4: Write `send.test.ts` and implement `send.ts`.** `sendEntry` POSTs `{ id, userId, queuedAt, payload }` to `/api/outbox/${entry.operation}` with `credentials: "same-origin"` and `cache: "no-store"`, then maps the response:
  - 200 → `delivered`
  - 409 → `held`
  - 401 → `signed_out`
  - 422 → `permanent` with the body's reason
  - 404 → `permanent` with reason `unknown_operation`
  - anything else, or a network error → `retry`

  Test each mapping with a mocked `fetch`.

- [ ] **Step 5: Drain through it.**
  - `dispatchers.ts`: `dispatchQueued(entry)` returns `sendEntry(entry)`. Remove the per-operation Server Action dispatch: `dispatchQueuedReport`, `dispatchQueuedPinWrite`, `dispatchQueuedVote` and `dispatchQueuedCheckIn` become unused, so delete them along with their now-unused tests, and name each removed test in the report.
  - Move `assertPinIsNotAwaitingCreate`'s rule into `isBlockedByPendingCreate` (already built in Task 2). Keep any user-visible behaviour identical.
  - `drain.ts`: the dispatcher returns a `SendOutcome` that is applied with `applyEntryOutcome`. Delivery listeners still fire for delivered entries.
  - `session-drain.ts`: before draining as user U, turn U's `held` entries back to `pending` (spec: "When a drain runs as the entry's owner again"). The claim flow for `userId: null` entries is unchanged.
  - Update `drain.test.ts`, `dispatchers.test.ts`, `use-outbox-drain.test.ts` and `identity-binding.test.ts` to the new contract. **Do not delete an assertion without replacing it with its equivalent under the new contract.** List each change in the report.

- [ ] **Step 6: Run the tests and five gates, then commit,** with the message `feat(outbox): send every queued write through one server-checked endpoint`.

---

### Task 5: The service worker sends the queue

**Files:**
- Modify: `public/sw.js`, `src/lib/service-worker.test.ts`, `src/lib/outbox/outbox.ts` (register sync after enqueue)
- Create: `src/lib/outbox/sync.ts`, `src/lib/outbox/sync.test.ts`

**Interfaces:**
- Consumes: the IndexedDB shape and channel (Task 3); `/api/outbox/[operation]` (Task 4); `schedule-cases.json` (Task 2)
- Produces:
  - `requestBackgroundSend(): void`, which registers sync tag `outbox` when supported and otherwise posts `{ type: "outbox-drain" }` to the active worker;
  - in `sw.js`, a `sync` handler for tag `outbox`, a `message` handler for `outbox-drain`, and a `drainOutboxInWorker()` function.

- [ ] **Step 1: Write the failing tests.**
  - **`sync.test.ts`:**
    - with `registration.sync.register` available, `requestBackgroundSend` calls it with `"outbox"`;
    - without it, the helper posts `{ type: "outbox-drain" }` to `navigator.serviceWorker.controller`;
    - with no service worker, it does nothing and does not throw.
  - **`service-worker.test.ts`,** using the existing `loadServiceWorker` harness extended with `fake-indexeddb` and a mock `fetch`. Seed IndexedDB with entries, fire `sync` with tag `outbox`, and assert:
    1. only due, pending entries with a non-null `userId` are POSTed, in `queuedAt` order;
    2. an `editPin` whose `createPin` is queued is not sent in that pass;
    3. a 200 deletes the entry; a 409 sets it held; a 422 with `too_old` sets it stuck with `too_old`; a 503 increments attempts and sets `nextAttemptAt` per the schedule; a 401 leaves the entry unchanged;
    4. no request goes to any URL other than `/api/outbox/*`: no Supabase and no auth;
    5. after a 503 while that entry is still due, the handler's `waitUntil` promise rejects, so the browser reschedules;
    6. stuck entries older than 7 days are deleted;
    7. a `{ type: "changed" }` message is posted on `weatherwell-outbox` after changes;
    8. a GET or POST to `/api/outbox/x` is never written to any cache.
  - **Parity:** load `src/lib/outbox/schedule-cases.json` in `service-worker.test.ts` and run every `applyOutcome` / `isDue` / `shouldPrune` / `isBlockedByPendingCreate` case through the worker's copies. The worker must expose them for tests the same way the harness already reaches worker internals; read how, and follow it.

- [ ] **Step 2: Run them and confirm they fail.**

- [ ] **Step 3: Implement.**
  - In `sw.js`, add plain-JS copies of `applyOutcome`, `isDue`, `shouldPrune` and `isBlockedByPendingCreate`, identical in behaviour to `schedule.ts`, with a comment pointing at the shared case table.
  - Add `drainOutboxInWorker()`:
    1. open the database;
    2. prune;
    3. collect due entries (`userId` non-null, not blocked), sorted by `queuedAt`;
    4. for each, POST `/api/outbox/${operation}` with `credentials: "same-origin"`;
    5. map the response exactly as `send.ts` does;
    6. apply the outcome;
    7. put or delete the entry;
    8. after the loop, post `{ type: "changed" }` if anything changed;
    9. throw if any entry that got `retry` is still due now, to request a reschedule.
  - Add `self.addEventListener("sync", (e) => { if (e.tag === "outbox") e.waitUntil(drainOutboxInWorker()); })`, plus a `message` handler for `{ type: "outbox-drain" }` that runs the same routine under `event.waitUntil`.
  - Make sure the existing fetch handler sends `/api/outbox/*` network-only without caching; a POST already bypasses it, but assert it anyway.
  - Bump `VERSION`.
  - In `outbox.ts`, call `requestBackgroundSend()` after a successful `enqueue` commit (browser only).

- [ ] **Step 4: Run the tests and five gates, then commit** `public/sw.js`, `src/lib/service-worker.test.ts`, `src/lib/outbox/sync.ts`, its test and `outbox.ts`, with the message `feat(outbox): the service worker sends the queue with the app closed`.

---

### Task 6: The waiting badge

**Files:**
- Create: `src/features/outbox/outbox-badge.tsx`, `src/features/outbox/outbox-badge.test.tsx`, `src/features/outbox/outbox-copy.ts`
- Modify: `src/app/layout.tsx` (mount next to `<LanguageToggle />`)

**Interfaces:**
- Consumes: `useOutbox`, `retryEntry`, `discardEntry` (Task 3); `knownSessionUserId` (`src/lib/auth/session-user.ts`); zone names via the existing reference-data hooks; `DEPTH` labels from `src/lib/depth.ts`
- Produces: `OutboxBadge(): JSX.Element | null`

- [ ] **Step 1: Write `outbox-badge.test.tsx`,** using `renderWithData` and seeding the queue through `enqueue`, or by writing `localStorage` directly in the queue's format:
  1. hidden when the queue is empty;
  2. hidden when the only entries are `held`, or belong to another `userId`;
  3. counts the current user's entries plus unowned (`userId: null`) ones: "2 waiting to send";
  4. with any stuck entry, shows "1 couldn't send", styled amber (assert a data attribute, e.g. `data-state="stuck"`, not a colour class);
  5. in Filipino: "2 naghihintay na maipadala" / "1 hindi naipadala";
  6. tapping opens a dialog listing "Water level report — Barangay Nilombot, Mapandan, Knee-deep" (use the fixture zone's name and the existing depth label) with its made-at time and "Will send when online";
  7. a stuck `too_old` entry shows "Couldn't send: Too old to send — report again if it's still flooded." and a `gave_up` entry shows "Couldn't send: Tried many times without success.";
  8. **Retry** turns the entry pending (the badge returns to "waiting");
  9. **Discard** asks "Discard this? It won't be sent." and removes the entry only on confirm; cancel keeps it;
  10. status text sits in an `aria-live="polite"` region;
  11. buttons meet the existing touch-target test's minimum. Follow `src/components/ui/touch-targets.test.tsx`.

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Implement.**
  - All strings go in `outbox-copy.ts` as `LocalizedText`, copied verbatim from spec section 3.
  - Use the existing `Dialog` / `Button` components from `src/components/ui/` (check what exists, and follow `AdminHeader`'s sign-out dialog if one exists).
  - For pins, votes and moderation, the description is the spec's short label.
  - "Sending…" shows while a drain is running for that entry. If no in-flight state is exposed, omit "Sending…" and note it in the report rather than inventing a flag.

- [ ] **Step 4: Mount it** in `src/app/layout.tsx` next to `<LanguageToggle />`, so it appears on resident and admin screens.

- [ ] **Step 5: Run the tests and five gates**, including the accessibility test suite already in the repo (`src/features/a11y/accessibility.test.tsx`), then **commit**, with the message `feat(outbox): a badge showing what is still waiting to send`.

---

### Task 7: PRD and live verification

- [ ] **Step 1: Update `PRD.md`.**
  - **Build Status:** set the "Background Sync (offline report queue)" row to **Built**, with a note. Background Sync sends with the app closed on Chromium browsers; iOS Safari and Firefox send when reopened; queued reports and check-ins keep their made-at time; reports older than 6 hours are refused; retries stop after 10 attempts or 3 days; the header badge shows waiting and stuck items.
  - **Known limits:** add a line saying an unowned first write on a shared phone is claimed by whoever next signs in.
  - **Commit** it with the message `docs(prd): offline sending is built`.
- [ ] **Step 2: Deploy.** Stop and ask the owner's OK to push `v0`. Once pushed, wait for the preview to serve `/api/outbox/submitWaterLevelReport`: a POST with no session returns 401.
- [ ] **Step 3: Set up a temporary zone.** In the live DB, create `zone-offline-test` (PSGC `0105528998`, name "Barangay Offlinetest, Mapandan") with a centre and hazard rows, following how Task 11 of the officials plan did it. Never use zone-1..4.
- [ ] **Step 4: Check the report and the badge.** In the preview browser, onboard to the test zone (if it is not selectable, set the stored selected zone to `zone-offline-test` through the app's own storage key), then:
  1. go offline (DevTools network offline, or the browser tool's offline emulation if available);
  2. file a report and confirm the badge shows "1 waiting to send";
  3. close the tab if the browser supports Background Sync, or keep it open otherwise;
  4. restore the network.

  Confirm the report row arrives with `reported_at` equal to its made-at time, not the arrival time, and that the badge disappears.
- [ ] **Step 5: Check the too-old path.** Seed the page's queue with a report entry whose `queuedAt` is 7 hours old (for the test zone, owned by the session user), trigger a drain, and confirm it becomes "Couldn't send: Too old to send…" and that no row was inserted.
- [ ] **Step 6: Check held entries.** Seed an entry with a different `userId` and confirm it is sent as held (409), not counted in the badge, and not deleted.
- [ ] **Step 7: Clean up.** Delete the test zone and its centre, hazards, reports and check-ins, and the anonymous user, then confirm the baseline counts.
- [ ] **Step 8: Report** every step's outcome. A failing step is the finding; do not retry it until it passes.

## Found during execution

- **Late reports count toward flood consensus** (final review, Minor 10). The agreeing-report count (`flood-monitoring-panel.tsx` and the recent-reports panel) is not time-windowed. Honest times make that visible: a report delivered 5 hours late now counts as "agreeing" beside current ones. This predates the branch; it belongs with V1's threshold engine, which should window the count by `reported_at`. Not fixed here.
- **Closed-app sending not yet seen on a real phone.** The live test (17 September 2026) ran in a browser with Background Sync switched off, so the worker was woken by the page's drain message, which runs the same routine. Confirm once on an Android phone: queue a report in airplane mode, close the app, turn airplane mode off, and check the report arrives without reopening it.
- **The unowned first write stays accepted.** A resident's first write on a shared phone is queued before any account exists, so whoever next signs in on that device claims it.
- **Monitoring's health check points at the V0 preview.** Switch `HEALTH_URL` in `.github/workflows/monitor.yml` (on `main`) to production when V0 is promoted. The watcher's error count covers only the deployment it calls.
- **The crash log can be flooded to its 300-per-hour cap,** which would hide real crashes for that hour. A per-source limit belongs in V1 if that ever happens.
- **Officials can forge an alert's previous level** by inserting directly instead of through `set_zone_alert` (carried from the officials plan). Making the function the only writer is a V1 security-model change.
- **Orphaned community pins** have no in-app path to moderation (carried from the officials plan).
