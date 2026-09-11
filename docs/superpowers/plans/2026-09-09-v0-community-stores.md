# v0 Community Stores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the last four `localStorage` stores — community pins, pin votes, evacuation check-ins and zone overrides — onto Postgres, so an operator's decision and a neighbour's pin reach other people's phones instead of only their own.

**Architecture:** The read path from Plan 2 and the outbox write spine from Plan 3 already exist; this plan widens both. The outbox gains a dispatcher registry so one queue serves six operations. Two new route handlers (`/api/pins`, `/api/check-ins`) feed two rewritten client stores that render server rows merged with anything still queued — the pattern `water-level-reports.ts` already proves. `zone-overrides.ts` is then deleted rather than migrated: with real alerts in Postgres there is nothing left to override.

**Tech Stack:** Next.js 16 (App Router, Server Actions, route handlers), Supabase Postgres with RLS, `@supabase/ssr` cookie sessions, React 19, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-05-v0-supabase-data-layer-design.md`

**Prior plans (complete, on `origin/v0` at `09211c6`):**
- `docs/superpowers/plans/2026-09-05-v0-database-foundation.md` — schema, RLS, seed
- `docs/superpowers/plans/2026-09-07-v0-read-path-migration.md` — `/api/zones`, `/api/alerts`, the reference-data and alerts stores
- `docs/superpowers/plans/2026-09-07-v0-write-spine.md` — cookie sessions, anonymous identity, the outbox, `submitWaterLevelReport`

---

## Global Constraints

Every task's requirements implicitly include this section. Copied verbatim from the spec and from rulings made during Plans 1–3.

**Security**

- Never import a secret or service-role key into anything under `src/`. The publishable key plus the cookie session is the only credential. `.env.local` is never committed.
- Server code never trusts `supabase.auth.getSession()`. Only `getClaims()` verifies the JWT signature against the project's published keys.
- Every write goes through a Server Action. The browser never writes to Postgres directly.
- A Server Action attributes rows to the uid it read from the verified claim, never to a uid the client supplied.
- `auth.uid()` in a policy is always wrapped: `(select auth.uid())`.
- `UPDATE` policies always carry both `USING` and `WITH CHECK`. With only `USING`, a caller can pass the check and reassign the row's owner on the way out.
- `auth.role()` appears nowhere. Anonymous users carry the `authenticated` Postgres role, so the role can never distinguish a guest from a real account.
- **A clean `get_advisors` run is not evidence that an INSERT policy is correct.** The `auth_allow_anonymous_sign_ins` lint inspects `USING` clauses and is blind to `WITH CHECK`, so it can never flag a broken INSERT policy. Only the RLS denial suite proves one.
- **Column GRANTs are a second, independent gate that RLS does not cover.** A policy that says "your own row" still lets you write any column you were granted. Insertable and updatable columns are narrowed per table in Task 2.

**Cost**

- **Sign-in happens on the first WRITE and nowhere else.** `useOutboxDrain`'s `if (readOutbox().length === 0) return;` is load-bearing. Every anonymous sign-in is a permanent row in `auth.users` counting against a free-tier MAU allowance; a resident who only reads must never become one. Nothing in this plan may call `ensureAnonymousSession()` on page load, on a read, or from a subscription.
- **Never create a Supabase branch** (`create_branch` bills per branch). Iterate with `execute_sql`.
- Delete every test user and test row you create. `auth.users`, `profiles`, `water_level_reports`, `community_pins`, `pin_votes` and `evacuation_check_ins` must all read 0 when a task finishes.

**Data**

- `weatherwell.onboarded` and `weatherwell.selectedZoneId` stay on the device. Everything else in `localStorage` retires.
- `weatherwell.deviceId` is retired: `auth.uid()` replaces it.
- Vote counts are **derived**, never stored. `community_pins` carries no `upvotes`/`downvotes` column.
- Copy written for one severity never survives onto another.
- The downgrade recency window is **6 hours**, and lives in exactly one constant.

**The three merge rules.** Every store in this plan renders server rows merged with queued writes. All three follow the same rules, and each store implements them for its own shape rather than sharing an abstraction:

1. **Dedupe by id.** One row per id, whatever the caller passed. Two rows for one thing is not a cosmetic duplicate — for pins it is a second vote, for check-ins a second head in a headcount.
2. **Drop `permanentlyFailed`.** An entry the server has rejected will never be delivered; rendering it as an ordinary row shows it as sent when it was refused.
3. **The server row wins.** When a server row carries a queued entry's id, the server row replaces the optimistic one rather than appearing beside it.

**Migrations**

- `apply_migration` stamps its own timestamp, which will not match the name you chose. Always read the applied version back from `list_migrations` and name the local file to match.
- Iterate with `execute_sql`; use `apply_migration` only once a change is settled.

**Testing**

- Every test you add must be proven to bite: break the behaviour it names in the source, run that specific test, confirm the **named** test fails, restore. Report what you broke and what failed. This branch has caught seven vacuous assertions across three plans; a test that passes against broken source is worse than no test.
- The four gates are `npm run lint`, `npm run typecheck`, `npx knip`, `npm run build`, plus `npx vitest run`. **Check knip's exit code, not its output text** — it exits 1 on findings, and CI runs it.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/lib/outbox/dispatchers.ts` | Maps an `OutboxOperation` to the function that sends it. The one place a new operation is registered. |
| `src/app/api/pins/route.ts` | `GET` — non-removed pins with tallies derived from `pin_votes`, plus the caller's own vote direction. Public, cacheable. |
| `src/app/api/check-ins/route.ts` | `GET` — check-ins scoped by RLS. **Never cached.** `Cache-Control: no-store`. |
| `src/app/actions/action-result.ts` | `ActionResult`, shared by every action in this plan. Not `"use server"` — a types-only module, so importing it from a client store costs nothing. |
| `src/app/actions/pins.ts` | `createPin`, `editPin`, `deleteOwnPin`, `setPinRemoved`. |
| `src/app/actions/vote-on-pin.ts` | `voteOnPin` — upsert on `(pin_id, voter_id)`, then evaluate net-score removal. |
| `src/app/actions/record-check-in.ts` | `recordCheckIn` — upsert on `(zone_id, user_id)`. |
| `src/app/actions/set-zone-alert.ts` | `setZoneAlert` — the transactional supersede-then-insert, via a database function. |
| `src/app/actions/set-center.ts` | `setCenterStatus`, `setCenterOccupancy`. Operator only. |
| `src/lib/alert-downgrade.ts` | Layer 9, re-pointed at `supersededSeverity`. Pure. |
| `src/lib/pins-mapper.ts` | Row → `CommunityPin`. Server-side, no `"use client"`. |

**Rewritten**

| File | Change |
|---|---|
| `src/lib/community-pins.ts` | Server rows + outbox merge. `deviceId` → `authorId`. `hasVotedOnPin` reads the response, not a local store. |
| `src/lib/evacuation-checkins.ts` | Server rows + outbox merge. `deviceId` → `userId`. |
| `src/lib/outbox/types.ts` | `OutboxOperation` widens to six; `OutboxPayloads` gains five entries. |
| `src/lib/center-status.ts` | Gains `deriveCenterStatusFromOccupancy` and `resolveEffectiveCenterStatus`, which move here from `zone-overrides.ts`. |
| `public/sw.js` | `VERSION` → `"v7"`. `/api/check-ins` bypasses the cache entirely; `/api/pins` joins the public allowlist. |

**Deleted**

| File | Why |
|---|---|
| `src/lib/zone-overrides.ts` + `.test.ts` | With alerts in Postgres there is nothing to override. This deletion is what closes the stale-override finding. |
| `src/lib/device-id.ts` | `getDeviceId()` has no callers once `auth.uid()` carries identity. |

**Modified (mechanical, Task 7)** — thirteen files import `useZoneOverrides` / `resolveEffectiveAlert`: `src/app/admin/page.tsx`, `src/app/admin/zone/[zoneId]/page.tsx`, `src/app/evacuation/page.tsx`, `src/app/report/page.tsx`, `src/features/admin/admin-map-canvas.tsx`, `src/features/admin/evacuation-management-panel.tsx`, `src/features/admin/flood-monitoring-panel.tsx`, `src/features/evacuation/evacuation-instructions.tsx`, `src/features/homepage-map/map-canvas.tsx`, `src/features/homepage-map/personal-status-headline.tsx`, `src/features/homepage-map/use-route-finding.ts`, `src/features/homepage-map/zone-alert-list-fallback.tsx`, `src/features/zones/zone-map.tsx`.

---

## Two traps this plan exists to avoid

Read these before Task 1. Both are places where Plan 3's pattern is **wrong** if copied.

### Trap 1: `23505` is not success for an upsert

Plan 3's `submitWaterLevelReport` treats a unique violation as success, because a replayed report that already landed is the same report. **That reasoning does not transfer.** Check-ins are unique on `(zone_id, user_id)` and votes on `(pin_id, voter_id)`, and both are things a resident is allowed to *change*. A resident who checks in "safe" and later changes it to "needs help" produces a second write that collides on the same constraint. Swallowing it as success would silently discard the most consequential message in the app.

Check-ins and votes therefore **upsert on the conflict target** rather than insert, and never treat `23505` as success. Only `community_pins` — which is append-only on the id primary key — keeps Plan 3's rule.

### Trap 2: a foreign-key violation is not always permanent

Plan 3 classifies `23503` as permanent, correctly: a report naming a zone that does not exist never will. But a **vote** whose pin is still sitting in the outbox two entries ahead is a different situation entirely — that pin is about to be created, and the vote's FK will resolve on the next drain. Classifying it permanent bins the vote for good.

`voteOnPin` therefore treats `23503` as **transient**. Every other action keeps it permanent. Each action states which rule it follows and why, in a comment.

---

## Task 1: Widen the outbox to many operations

One queue already exists and works. It hardcodes a single operation; every later task needs it to carry six.

**Files:**
- Create: `src/lib/outbox/dispatchers.ts`, `src/lib/outbox/dispatchers.test.ts`
- Modify: `src/lib/outbox/types.ts`, `src/lib/outbox/use-outbox-drain.ts`, `src/lib/water-level-reports.ts`, `src/lib/water-level-reports.test.ts`

**Interfaces:**
- Consumes: `enqueue(operation, payload)`, `drainOutbox(dispatch)`, `flushOutbox(dispatch)`, `PermanentFailure`, `OutboxEntry` (Plan 3, unchanged)
- Produces:
  - `type OutboxOperation = "submitWaterLevelReport" | "createPin" | "editPin" | "deleteOwnPin" | "voteOnPin" | "recordCheckIn"`
  - `OutboxPayloads` — one entry per operation, exact shapes in Step 3
  - `dispatchQueued(entry: OutboxEntry): Promise<void>` from `dispatchers.ts` — the single dispatcher every caller passes to `flushOutbox`
  - `payloadOf<K extends OutboxOperation>(entry: OutboxEntry, operation: K): OutboxPayloads[K] | undefined` — narrows an entry's payload by operation, returning `undefined` when the entry is a different operation

**Note on `enqueue`'s typing.** `enqueue` already takes `(operation, payload)`. Verify its signature is generic over the operation — `enqueue<K extends OutboxOperation>(operation: K, payload: OutboxPayloads[K])`. If it is not, make it so in this task. A non-generic `enqueue` would let Task 3 queue a pin payload under `"recordCheckIn"` and nothing would complain until it reached Postgres.

- [ ] **Step 1: Write the failing test**

Create `src/lib/outbox/dispatchers.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { payloadOf } from "./dispatchers";
import { enqueue } from "./outbox";

beforeEach(() => {
  localStorage.clear();
});

describe("payloadOf", () => {
  it("narrows a payload when the operation matches", () => {
    const entry = enqueue("recordCheckIn", { zoneId: "zone-1", status: "safe" });

    expect(payloadOf(entry, "recordCheckIn")).toEqual({ zoneId: "zone-1", status: "safe" });
  });

  it("returns undefined for an entry of a different operation", () => {
    // A store merging its own queued writes must never render another
    // store's entry as one of its own. Before six operations shared this
    // queue, a merge could filter on nothing and be right by accident.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    expect(payloadOf(entry, "recordCheckIn")).toBeUndefined();
  });
});

describe("dispatchQueued", () => {
  it("refuses an operation it has no dispatcher for", async () => {
    // A new operation added to the union without a dispatcher must fail
    // loudly at the first drain rather than silently succeeding and
    // dropping the write. The cast is the point of the test: it stands in
    // for the future edit that adds a case to the union and forgets one here.
    const { dispatchQueued } = await import("./dispatchers");
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });
    const broken = { ...entry, operation: "notAnOperation" as typeof entry.operation };

    await expect(dispatchQueued(broken)).rejects.toThrow(/no dispatcher/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/lib/outbox/dispatchers.test.ts
```
Expected: FAIL — `./dispatchers` does not exist.

- [ ] **Step 3: Widen the payload types**

Replace the contents of `src/lib/outbox/types.ts`'s first two exports with:

```ts
import type { DepthLevel } from "@/lib/depth";
import type { PinStatusTag } from "@/lib/community-pin";
import type { CheckInStatus } from "@/lib/types";

export type OutboxOperation =
  | "submitWaterLevelReport"
  | "createPin"
  | "editPin"
  | "deleteOwnPin"
  | "voteOnPin"
  | "recordCheckIn";

export interface OutboxPayloads {
  submitWaterLevelReport: { zoneId: string; depthLevel: DepthLevel };
  createPin: {
    zoneId: string;
    statusTag: PinStatusTag;
    caption: string;
    lat: number;
    lng: number;
  };
  editPin: { pinId: string; statusTag: PinStatusTag; caption: string };
  deleteOwnPin: { pinId: string };
  voteOnPin: { pinId: string; direction: 1 | -1 };
  recordCheckIn: { zoneId: string; status: CheckInStatus };
}
```

Then change `OutboxEntry.payload` from `OutboxPayloads[OutboxOperation]` to:

```ts
  payload: OutboxPayloads[OutboxOperation];
```

— that is, leave it as the union. Narrowing happens through `payloadOf`, not through the entry type, because an entry read back from `localStorage` genuinely could be any of them.

**`CheckInStatus` moves to `src/lib/types.ts` in this task.** It currently lives in `evacuation-checkins.ts`, which imports `OutboxEntry` from this very module — so importing it back would make the two files circular. Type-only cycles usually erase harmlessly, but `verbatimModuleSyntax` is exactly the setting that stops them doing so, and a leaf module is the honest home for a two-value union anyway. `types.ts` imports only from `./severity`. Re-export it from `evacuation-checkins.ts` so existing importers do not change.

`photoDataUrl` is deliberately absent from `createPin`. Pin photos going live is out of scope per the spec ("blocked on extending the consent and retention rules first"), and queueing a data URL would put a base64 image in `localStorage` where the outbox's quota guard would then fail every subsequent write.

- [ ] **Step 4: Write the dispatcher registry**

Create `src/lib/outbox/dispatchers.ts`:

```ts
"use client";

import type { OutboxEntry, OutboxOperation, OutboxPayloads } from "./types";

/**
 * Narrows an entry's payload by its operation.
 *
 * Six operations now share one queue, so every consumer that reads the outbox
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
    case "deleteOwnPin": {
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
```

**The five dispatchers named above do not exist yet.** Tasks 3, 4 and 5 create them. Until then this module will not typecheck. That is deliberate and it is this task's one piece of scaffolding — see Step 5.

- [ ] **Step 5: Stub the four missing dispatchers so the branch stays green**

Add to `src/lib/water-level-reports.ts` — nothing, `dispatchQueuedReport` already exists and is already exported.

Add to the **end** of `src/lib/community-pins.ts`:

```ts
/**
 * Placeholder until Task 3 replaces it. Throwing rather than no-op'ing: a
 * silent success would make drainOutbox call markDelivered and destroy the
 * queued write. Throwing leaves the entry queued for the real dispatcher.
 */
export async function dispatchQueuedPinWrite(entry: OutboxEntry): Promise<void> {
  throw new Error(`Pin writes are not wired up yet (${entry.operation})`);
}

/** Placeholder until Task 4 replaces it. See dispatchQueuedPinWrite. */
export async function dispatchQueuedVote(entry: OutboxEntry): Promise<void> {
  throw new Error(`Pin votes are not wired up yet (${entry.id})`);
}
```

Add to the end of `src/lib/evacuation-checkins.ts`:

```ts
/** Placeholder until Task 5 replaces it. See dispatchQueuedPinWrite in community-pins.ts. */
export async function dispatchQueuedCheckIn(entry: OutboxEntry): Promise<void> {
  throw new Error(`Check-ins are not wired up yet (${entry.id})`);
}
```

Both files need `import type { OutboxEntry } from "./outbox/types";`.

Nothing enqueues these operations until Tasks 3–5, so these throws are unreachable in this task — but they are the honest placeholder, because the alternative silently deletes a resident's write.

- [ ] **Step 6: Point the two drain call sites at the registry**

In `src/lib/outbox/use-outbox-drain.ts`, replace the import of `dispatchQueuedReport` from `@/lib/water-level-reports` with `dispatchQueued` from `./dispatchers`, and pass `dispatchQueued` to `flushOutbox`.

In `src/lib/water-level-reports.ts`, `triggerDrain()` currently passes `dispatchQueuedReport`. Change it to pass `dispatchQueued`, imported from `./outbox/dispatchers`.

**Why `triggerDrain` must drain the whole queue, not just reports:** a resident with a queued pin and no signal who then files a report would otherwise flush only the report and leave the pin sitting there. One queue, one dispatcher.

Leave `dispatchQueuedReport` exported — `dispatchers.ts` imports it.

- [ ] **Step 7: Run the tests**

```bash
npx vitest run
```
Expected: PASS. Report the total and the delta from 464. `water-level-reports.test.ts` may need its `triggerDrain` mocks re-pointed; if a test now mocks the wrong module, fix the test, not the source.

- [ ] **Step 8: Prove the new tests bite**

For each of the three tests in `dispatchers.test.ts`: break the behaviour it names, run it, confirm the named test fails, restore.

- `payloadOf` narrowing — make it return the payload unconditionally.
- `payloadOf` mismatch — same break, different test.
- `dispatchQueued` default branch — replace the `throw` with `return`.

Report what you broke and which test failed each time.

- [ ] **Step 9: Run all gates and commit**

```bash
npm run lint && npm run typecheck && npx vitest run && npx knip; echo "knip exit: $?"
npm run build
```

```bash
git add src/lib/outbox src/lib/water-level-reports.ts src/lib/water-level-reports.test.ts src/lib/community-pins.ts src/lib/evacuation-checkins.ts
git commit -m "feat(outbox): carry six operations through one queue"
```

---

## Task 2: Close the column-grant and policy holes before anything writes through them

Plan 1 created the tables and Plan 3 tightened exactly one of them. The rest still carry the permissive column GRANTs that `create table` produced, and RLS does not cover them — a policy saying "your own row" still lets you write any column you were granted.

Verified against the live database on 2026-09-09:

| Table | `authenticated` can currently write | Consequence |
|---|---|---|
| `community_pins` | `removed`, `removed_reason` on both INSERT and UPDATE | **A resident can un-remove their own net-score-removed pin.** Anti-abuse layer 10 is decorative. |
| `community_pins` | `created_at` | A pin can be backdated to sort above real ones. |
| `pin_votes` | `voted_at` | Same. |
| `evacuation_check_ins` | `checked_in_at` | A check-in can claim to be older or newer than it is. |
| `alerts` | `issued_by` | An operator can attribute an alert to another operator. |
| `profiles` | `role` on INSERT | No INSERT policy exists, so RLS denies it today — but the grant is one forgotten policy away from self-promotion to operator. |

And one missing policy: **`evacuation_centers` has only a SELECT policy.** Task 6's `setCenterStatus` and `setCenterOccupancy` run as the calling operator, so both would be denied. The spec says centres "carry no client write policy", written when occupancy was assumed to go through a service-role path; it does not, so an operator UPDATE policy is required.

**Files:**
- Create: one migration, named to match what `list_migrations` reports
- Test: SQL assertions run through the Supabase MCP, recorded in the task report

**Interfaces:**
- Produces: insertable and updatable column sets narrow enough that Tasks 3–6 cannot write a column they should not; an `evacuation_centers` UPDATE policy Task 6 depends on

- [ ] **Step 1: Record the current state, so the diff is provable**

Run through MCP `execute_sql` and paste both results into your report:

```sql
select table_name, privilege_type,
       string_agg(distinct column_name, ',' order by column_name) as cols
from information_schema.column_privileges
where grantee = 'authenticated' and table_schema = 'public'
  and privilege_type in ('INSERT','UPDATE')
group by table_name, privilege_type order by table_name, privilege_type;
```

```sql
select tablename, policyname, cmd, roles::text,
       qual is not null as has_using, with_check is not null as has_with_check
from pg_policies where schemaname = 'public' order by tablename, cmd;
```

- [ ] **Step 2: Iterate the SQL with `execute_sql`, not `apply_migration`**

`apply_migration` writes a history entry per call. Get the statements right first.

```sql
-- Pins. A resident writes what a pin SAYS; the server owns when it was made
-- and whether it has been removed. `removed`/`removed_reason` are the whole
-- of anti-abuse layer 10: leaving them writable lets the author of a
-- brigaded-down pin simply put it back.
revoke insert, update on public.community_pins from authenticated;
grant insert (id, zone_id, status_tag, caption, lat, lng, author_id)
  on public.community_pins to authenticated;
grant update (status_tag, caption, removed, removed_reason)
  on public.community_pins to authenticated;

-- Votes. Direction is the vote; everything else identifies it.
revoke insert, update on public.pin_votes from authenticated;
grant insert (pin_id, voter_id, direction) on public.pin_votes to authenticated;
grant update (direction) on public.pin_votes to authenticated;

-- Check-ins. Status is the message; the timestamp is the server's.
revoke insert, update on public.evacuation_check_ins from authenticated;
grant insert (id, zone_id, user_id, status) on public.evacuation_check_ins to authenticated;
grant update (status) on public.evacuation_check_ins to authenticated;

-- Alerts. Operator-only already, but issued_by is an attribution claim and
-- the server sets it from the verified uid, so nobody needs to supply it.
revoke insert, update on public.alerts from authenticated;
grant insert (id, zone_id, severity, message, source, confidence,
              predicted_timing, superseded_severity)
  on public.alerts to authenticated;
grant update (is_active, superseded_at) on public.alerts to authenticated;

-- Profiles. No INSERT or UPDATE policy exists, so RLS denies both today.
-- The grant is removed anyway: role is not self-assignable, and that should
-- be true at two independent layers, not one.
revoke insert, update on public.profiles from authenticated;

-- Reference data. No write policy exists for any of these either; the grants
-- are removed for the same reason.
revoke insert, update on public.zones from authenticated;
revoke insert, update on public.points_of_interest from authenticated;
revoke insert, update on public.hazard_susceptibility from authenticated;

-- Centres: occupancy is operator-written through a Server Action running as
-- the operator, so it needs a policy. Without one, Task 6's setCenterOccupancy
-- returns zero rows and no error.
revoke insert, update on public.evacuation_centers from authenticated;
grant update (status, current_occupancy) on public.evacuation_centers to authenticated;

create policy centers_update_operator on public.evacuation_centers
  for update to authenticated
  using       ((select private.is_operator()))
  with check  ((select private.is_operator()));
```

**`alerts` keeps `issued_by` out of the insertable set, which means the column must have a default or be nullable.** The schema declares it `uuid references auth.users (id)` with no `not null`, so it is nullable — and a manual alert with a null `issued_by` loses the audit trail the spec asks for. Add a default that reads the caller:

```sql
alter table public.alerts alter column issued_by set default (select auth.uid());
```

Verify it works before moving on — a `select auth.uid()` in a column default is evaluated per insert as the inserting role, which is what is wanted, but confirm it rather than assume:

```sql
select pg_get_expr(adbin, adrelid) from pg_attrdef
join pg_attribute a on a.attrelid = adrelid and a.attnum = adnum
where adrelid = 'public.alerts'::regclass and a.attname = 'issued_by';
```

If the default does not evaluate as expected, the fallback is to keep `issued_by` insertable and have `setZoneAlert` pass the uid it read from the verified claim — RLS still restricts the insert to operators, so the exposure is one operator attributing to another, which is a much smaller hole than a null audit trail. Record which route you took and why.

- [ ] **Step 3: Prove each revoke actually bites, from a real session**

Do not assert this from the grant table. Create one throwaway anonymous user, impersonate it, and confirm each denial. Use the RLS test helper Plan 1 established (`set local role authenticated` plus `set local request.jwt.claims`); read it out of the Plan 1 migration files if you need the exact form, and **make sure it resets the role in every branch, including on a non-`insufficient_privilege` exception** — Plan 1 shipped a version that leaked the impersonated role and it was caught in review.

Assertions, each of which must raise:

| Attempt | Expected |
|---|---|
| Resident inserts a `community_pins` row with `removed = false` | denied — column not granted |
| Resident updates their own pin setting `removed = false` | denied — column not granted |
| Resident inserts a pin with `created_at` set | denied |
| Resident inserts a `pin_votes` row with `voted_at` set | denied |
| Resident inserts an `evacuation_check_ins` row with `checked_in_at` set | denied |
| Resident inserts into `profiles` at all | denied |
| Resident updates `evacuation_centers.current_occupancy` | denied — not an operator |

And two that must **succeed**, because a revoke that also broke the legitimate path is a worse outcome than the hole:

| Attempt | Expected |
|---|---|
| Resident inserts a pin with `(id, zone_id, status_tag, caption, lat, lng, author_id = own uid)` | succeeds |
| Resident updates their own pin's `caption` | succeeds |

**A denial that raises for the wrong reason is not a passing test.** Assert on the SQLSTATE: a column-grant refusal is `42501`, and so is an RLS refusal — so for the grant cases, also confirm the same statement succeeds once the offending column is dropped from the statement. Without that second half you have proved nothing about *which* gate refused.

- [ ] **Step 4: Run the advisors, and read the result correctly**

```
mcp: get_advisors (type: security)
```

Fix anything genuinely new. **Record in your report that a clean run says nothing about the INSERT policies you just touched** — the `auth_allow_anonymous_sign_ins` lint reads `USING` and is blind to `WITH CHECK`. Step 3 is the evidence; this step is a second opinion on a different question.

- [ ] **Step 5: Apply as a migration and reconcile the name**

```
mcp: apply_migration (name: "harden_community_grants")
```

Then:

```
mcp: list_migrations
```

Take the version it reports and create `supabase/migrations/<that version>_harden_community_grants.sql` with the same SQL. The timestamp `apply_migration` stamps will not be the one you would have guessed; the local file must match what the remote recorded or `db diff` produces conflicting output forever.

- [ ] **Step 6: Clean up and verify the database is empty**

```sql
delete from public.pin_votes;
delete from public.community_pins;
delete from public.evacuation_check_ins;
delete from auth.users where is_anonymous;
select
  (select count(*) from auth.users) as users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.community_pins) as pins,
  (select count(*) from public.pin_votes) as votes,
  (select count(*) from public.evacuation_check_ins) as checkins;
```

Expected: all zero.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations
git commit -m "fix(rls): stop residents writing columns that are not theirs to write"
```

---

## Task 3: Pins — Server Actions, `/api/pins`, and the store

**Files:**
- Create: `src/app/actions/action-result.ts`, `src/app/actions/pins.ts`, `src/app/actions/pins.test.ts`, `src/app/api/pins/route.ts`, `src/lib/pins-mapper.ts`
- Modify: `src/lib/community-pins.ts`, `src/lib/community-pins.test.ts` (create if absent), `src/features/homepage-map/use-pin-flow.ts`
- Modify: `public/sw.js` — add `/api/pins` to the public allowlist

**Interfaces:**
- Consumes: `enqueue`, `payloadOf`, `flushOutbox`, `PermanentFailure`, `dispatchQueued` (Task 1); `createSupabaseUserClient()`, `createSupabaseServerClient()` (Plan 3)
- Produces:
  - `createPin(input: { id, zoneId, statusTag, caption, lat, lng }): Promise<ActionResult>`
  - `editPin(input: { pinId, statusTag, caption }): Promise<ActionResult>`
  - `deleteOwnPin(input: { pinId }): Promise<ActionResult>`
  - `setPinRemoved(input: { pinId, removed, reason }): Promise<ActionResult>`
  - `type ActionResult = { ok: true } | { ok: false; permanent: boolean; error: string }` — declared once in `src/app/actions/action-result.ts` and imported by every action in Tasks 3-6. `submit-water-level-report.ts`'s own `SubmitReportResult` is structurally identical; re-point it at this type and delete the duplicate.
  - `dispatchQueuedPinWrite(entry: OutboxEntry): Promise<void>` from `community-pins.ts`
  - `CommunityPin` with `authorId: string` replacing `deviceId`
  - `mergePins(serverRows: CommunityPin[], queued: OutboxEntry[]): CommunityPin[]`

**A note on `deleteOwnPin`.** The spec's schema has "no delete: removal is the soft-delete flag, so restore stays possible", and there is no DELETE policy. But the existing `deleteOwnPin` is a resident permanently removing *their own* pin — their own choice about their own content, which the current code comments distinguish from the anti-abuse path. Implement it as a soft delete with `removed_reason = 'admin'`, and **say in a comment that it is not a hard delete and why**: the row is retained because it is the only record that the pin ever existed, and the resident's intent (it disappears from every map) is satisfied. Do not add a DELETE policy.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/community-pins.test.ts` (or add to it if it exists):

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { enqueue, markFailed } from "@/lib/outbox/outbox";
import { mergePins, type CommunityPin } from "./community-pins";

beforeEach(() => {
  localStorage.clear();
});

const serverPin = (id: string, over: Partial<CommunityPin> = {}): CommunityPin => ({
  id,
  zoneId: "zone-1",
  statusTag: "flooded",
  caption: "Knee-deep by the market",
  lat: 16.06,
  lng: 120.4,
  upvotes: 0,
  downvotes: 0,
  ownVote: undefined,
  createdAt: new Date().toISOString(),
  authorId: "user-1",
  removed: false,
  ...over,
});

describe("mergePins", () => {
  it("shows a queued pin immediately, before it has reached the server", () => {
    // A resident marking an impassable road during a flood must see it land
    // at once. Waiting on a round trip they may never complete is how the
    // app feels broken exactly when it matters.
    const entry = enqueue("createPin", {
      zoneId: "zone-1",
      statusTag: "impassable",
      caption: "Bridge is under water",
      lat: 16.04,
      lng: 120.48,
    });

    const merged = mergePins([], [entry]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(entry.id);
    expect(merged[0].caption).toBe("Bridge is under water");
  });

  it("does not show a queued pin twice once the server row arrives", () => {
    const entry = enqueue("createPin", {
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Market",
      lat: 16.06,
      lng: 120.4,
    });

    expect(mergePins([serverPin(entry.id)], [entry])).toHaveLength(1);
  });

  it("renders one row when an id is queued twice", () => {
    // Two rows for one pin is not a cosmetic duplicate: the map draws two
    // markers on one spot and the zone's pin count says two people reported
    // it when one did.
    const entry = enqueue("createPin", {
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Market",
      lat: 16.06,
      lng: 120.4,
    });

    expect(mergePins([], [entry, entry])).toHaveLength(1);
  });

  it("drops a permanently failed pin instead of showing it as posted", () => {
    const entry = enqueue("createPin", {
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Market",
      lat: 16.06,
      lng: 120.4,
    });
    markFailed(entry.id, "denied", true);

    const queued = JSON.parse(localStorage.getItem("weatherwell.outbox") ?? "[]");

    expect(mergePins([], queued)).toHaveLength(0);
  });

  it("ignores an entry belonging to another store", () => {
    // Six operations share one queue. A merge that filters on nothing would
    // render a water-level report as a map pin.
    const entry = enqueue("submitWaterLevelReport", { zoneId: "zone-1", depthLevel: "knee" });

    expect(mergePins([], [entry])).toHaveLength(0);
  });

  it("applies a queued edit to the server row it edits", () => {
    // The resident retyped the caption offline. Showing the old one back to
    // them reads as the edit having failed.
    const pin = serverPin("pin-1", { caption: "Old wording" });
    const entry = enqueue("editPin", {
      pinId: "pin-1",
      statusTag: "receding",
      caption: "New wording",
    });

    const [merged] = mergePins([pin], [entry]);

    expect(merged.caption).toBe("New wording");
    expect(merged.statusTag).toBe("receding");
  });

  it("hides a pin the resident deleted while offline", () => {
    const pin = serverPin("pin-1");
    const entry = enqueue("deleteOwnPin", { pinId: "pin-1" });

    expect(mergePins([pin], [entry])).toHaveLength(0);
  });
});
```

Create `src/app/actions/pins.test.ts` with the session and classification tests:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, from }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPin", () => {
  it("treats a missing session as transient, so the queued pin is retried rather than binned", async () => {
    // Same reasoning as submitWaterLevelReport: a blocked cookie or a token
    // that expired while the device was offline resolves on a later attempt,
    // and permanent would make the drain skip it forever AND mergePins drop
    // it from the map.
    getClaims.mockResolvedValue({ data: { claims: undefined } });
    const { createPin } = await import("./pins");

    const result = await createPin({
      id: "11111111-1111-4111-8111-111111111111",
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Market",
      lat: 16.06,
      lng: 120.4,
    });

    expect(result).toEqual({ ok: false, permanent: false, error: expect.any(String) });
  });

  it("attributes the pin to the uid from the verified claim, never to client input", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });
    const insert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ insert });
    const { createPin } = await import("./pins");

    await createPin({
      id: "11111111-1111-4111-8111-111111111111",
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Market",
      lat: 16.06,
      lng: 120.4,
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ author_id: "real-user" }));
  });

  it("treats a replayed pin that already landed as success", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });
    from.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { code: "23505" } }) });
    const { createPin } = await import("./pins");

    const result = await createPin({
      id: "11111111-1111-4111-8111-111111111111",
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Market",
      lat: 16.06,
      lng: 120.4,
    });

    expect(result).toEqual({ ok: true });
  });

  it("rejects a caption longer than the limit without contacting the database", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "real-user" } } });
    const { createPin } = await import("./pins");

    const result = await createPin({
      id: "11111111-1111-4111-8111-111111111111",
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "x".repeat(281),
      lat: 16.06,
      lng: 120.4,
    });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.any(String) });
    expect(from).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npx vitest run src/lib/community-pins.test.ts src/app/actions/pins.test.ts
```
Expected: FAIL — `mergePins` is not exported, `./pins` does not exist.

- [ ] **Step 3: Write the Server Actions**

Create `src/app/actions/pins.ts`. It is `"use server"`. Follow `submit-water-level-report.ts`'s shape exactly, including its SQLSTATE constants and its argued classification of a missing session as transient.

Requirements:

- `CAPTION_MAX_LENGTH = 280`. A caption over it, or empty after trimming, is `permanent: true` and never reaches the database — a validation rejection cannot become valid on retry.
- `PIN_STATUS_ORDER` from `@/lib/community-pin` is the allowed `statusTag` set; anything else is `permanent: true`.
- `createPin` inserts `{ id, zone_id, status_tag, caption, lat, lng, author_id: userId }` and nothing else. Those are exactly the columns Task 2 left insertable; supplying any other would now be refused.
- `23505` on `createPin` is **success** — it is an id-primary-key collision from a replay. (Contrast with Tasks 4 and 5, where it is not.)
- `editPin` updates `{ status_tag, caption }` filtered by `.eq("id", pinId)`. RLS scopes it to the author or an operator; **do not add an `author_id` filter in TypeScript as well** — RLS is the authority and duplicating it in two places is how they drift.
- `deleteOwnPin` updates `{ removed: true, removed_reason: "admin" }`.
- `setPinRemoved(pinId, removed, reason)` updates `{ removed, removed_reason: removed ? reason : null }`. This is the operator path, and RLS's `is_operator()` is what restricts it.
- `42501`, `23514` and `23503` are permanent for every action in this file. A pin naming a zone that does not exist never will.

**An UPDATE denied by RLS returns zero rows and no error.** `editPin`, `deleteOwnPin` and `setPinRemoved` must therefore ask for the affected rows and treat zero as a permanent failure, or the outbox will mark a refused edit as delivered:

```ts
const { data, error } = await supabase
  .from("community_pins")
  .update({ status_tag: input.statusTag, caption })
  .eq("id", input.pinId)
  .select("id");

if (error) return classify(error);
if (!data || data.length === 0) {
  return {
    ok: false,
    permanent: true,
    error: "That pin is not yours to edit, or no longer exists.",
  };
}
return { ok: true };
```

Write a test for that zero-row case and prove it bites.

- [ ] **Step 4: Write the mapper and the route handler**

Create `src/lib/pins-mapper.ts` — **no `"use client"`**, and `community-pins.ts` must not re-export from it. This is the same separation `alerts-mapper.ts` documents: `community-pins.ts` is a client module, and Next turns every export of one into a client reference for server callers, so a route handler importing through it gets a 500.

```ts
import type { PinStatusTag } from "./community-pin";

export interface PinRow {
  id: string;
  zone_id: string;
  status_tag: string;
  caption: string;
  lat: number;
  lng: number;
  author_id: string;
  created_at: string;
  removed: boolean;
}

export interface PinTally {
  pin_id: string;
  direction: number;
  voter_id: string;
}

export interface MappedPin {
  id: string;
  zoneId: string;
  statusTag: PinStatusTag;
  caption: string;
  lat: number;
  lng: number;
  upvotes: number;
  downvotes: number;
  /** The caller's own vote, if they have one. Replaces the local votes store. */
  ownVote?: 1 | -1;
  createdAt: string;
  authorId: string;
  removed: boolean;
}

/**
 * Tallies are derived here rather than stored, because a denormalised counter
 * beside a pin_votes table is two sources of truth for one number and they
 * will disagree the first time a write is retried.
 */
export function toPins(rows: PinRow[], votes: PinTally[], callerId: string | undefined): MappedPin[] {
  const byPin = new Map<string, PinTally[]>();
  for (const vote of votes) {
    const list = byPin.get(vote.pin_id);
    if (list) list.push(vote);
    else byPin.set(vote.pin_id, [vote]);
  }

  return rows.map((row) => {
    const cast = byPin.get(row.id) ?? [];
    const own = callerId ? cast.find((vote) => vote.voter_id === callerId) : undefined;
    return {
      id: row.id,
      zoneId: row.zone_id,
      statusTag: row.status_tag as PinStatusTag,
      caption: row.caption,
      lat: row.lat,
      lng: row.lng,
      upvotes: cast.filter((vote) => vote.direction === 1).length,
      downvotes: cast.filter((vote) => vote.direction === -1).length,
      ownVote: own ? (own.direction === 1 ? 1 : -1) : undefined,
      createdAt: row.created_at,
      authorId: row.author_id,
      removed: row.removed,
    };
  });
}
```

Create `src/app/api/pins/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { toPins, type PinRow, type PinTally } from "@/lib/pins-mapper";

/**
 * Every pin including removed ones, with vote tallies derived from pin_votes
 * and the caller's own vote direction.
 *
 * Removed pins are returned rather than filtered here because the admin
 * moderation panel must be able to restore one, and a pin it cannot see is a
 * pin it cannot restore. The public map filters them client-side, which is
 * what useCommunityPins already does.
 *
 * The USER client, not the public one — unlike /api/reports. Pins themselves
 * are world-readable, but `ownVote` is per-caller, and reading it needs the
 * caller's session. An unauthenticated visitor still gets every pin and every
 * tally; they simply have no vote of their own to report.
 */
export async function GET() {
  const supabase = await createSupabaseUserClient();

  const { data: claims } = await supabase.auth.getClaims();
  const callerId = claims?.claims?.sub;

  const [pins, votes] = await Promise.all([
    supabase
      .from("community_pins")
      .select("id, zone_id, status_tag, caption, lat, lng, author_id, created_at, removed")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("pin_votes").select("pin_id, direction, voter_id").limit(5000),
  ]);

  // Never 200 with an empty list on failure — "no pins" reads as "nobody has
  // reported anything" to whoever is looking at a flooded barangay.
  if (pins.error) return NextResponse.json({ error: pins.error.message }, { status: 502 });
  if (votes.error) return NextResponse.json({ error: votes.error.message }, { status: 502 });

  return NextResponse.json(toPins(pins.data as PinRow[], votes.data as PinTally[], callerId));
}
```

**`ownVote` makes this response caller-specific, which sits badly with a shared cache.** It is still cacheable and still on the public allowlist, because the sensitive half is "did *I* vote", not "who voted" — and a stale `ownVote` costs a resident a refused duplicate vote, not a privacy breach. Write that trade-off in a comment. If you conclude it does not hold, say so in your report rather than silently switching the route to `no-store`: that is a ruling for the controller.

Add `/api/pins` to `PUBLIC_API_PATHS` in `public/sw.js`. **Do not bump `VERSION` in this task** — Task 5 changes the same file and one bump covers both. Note in your report that you deliberately did not.

- [ ] **Step 5: Rewrite the store**

Rewrite `src/lib/community-pins.ts`:

- `CommunityPin` keeps every field it has except `deviceId`, which becomes `authorId: string`. It gains `ownVote?: 1 | -1`. `photoDataUrl` stays in the interface (seed pins still carry one) but is never written by `createPin`.
- Delete `SEED_COMMUNITY_PINS`, both `createLocalStorageStore` calls, and `getDeviceId`. The seeds move to the database (Plan 1's seed script already owns demo content).
- `useServerPins()` — fetches `/api/pins` on mount and again after a drain delivers, exactly as `useServerReports` does. **Read `water-level-reports.ts` and follow it**, including the `onDelivered` subscription, the held-delivered buffer, the cache-busting parameter on the post-delivery refetch, and the plain follow-up request that warms the key the next mount reads. All four exist for reasons a reviewer proved; do not reinvent them.
- `mergePins(serverRows, queued)` — implements the three merge rules for pins, plus the two overlays the tests above specify: a queued `editPin` patches the row it names, a queued `deleteOwnPin` hides it.
- `useCommunityPins()` returns non-removed pins; `useAllCommunityPins()` returns everything.
- `isOwnPin(pin, userId)` gains a second parameter. **Do not have it call a hook or read a session** — it is used inside loops. Callers get the uid from `useSessionUserId()`.

**`useSessionUserId` was deleted in Plan 3** because it had no callers and knip failed CI over it. Reinstate it in `src/lib/auth/anonymous-session.ts` — `git show 09211c6^:src/lib/auth/anonymous-session.ts` has the original — **but with the sign-in call removed**: it must report the uid of a session that already exists and return `null` otherwise. A hook that signs a reader in to find out who they are would make every visitor a billable row, which is precisely the rule this plan is bound by.

```ts
/**
 * The resident's user id if they already have a session, or null.
 *
 * Deliberately does NOT call ensureAnonymousSession: this hook is mounted by
 * components that only read (the map, the moderation panel), and signing in
 * to answer "who am I" would make every visitor a permanent auth.users row.
 * A resident who has never written has no id, and `isOwnPin` correctly
 * reports that none of the pins are theirs — because none of them are.
 */
export function useSessionUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (active) setUserId(data.session?.user.id ?? null);
      });
    return () => {
      active = false;
    };
  }, []);

  return userId;
}
```

`getSession()` is acceptable **here and only here**: this is browser code deciding which buttons to show, not server code deciding what to trust. Authorisation is RLS's job and it reads the verified claim. Write that distinction in the comment, because "never use getSession" is otherwise a rule this appears to break.

- `addCommunityPin(input)` enqueues `createPin` and triggers a drain. `updateCommunityPin(pinId, patch)` enqueues `editPin`. `deleteOwnPin(pinId)` enqueues `deleteOwnPin`. All three keep their current signatures so `use-pin-flow.ts` changes as little as possible.
- `dispatchQueuedPinWrite(entry)` — replaces the Task 1 placeholder. Dynamically imports `@/app/actions/pins`, switches on `entry.operation`, and throws `PermanentFailure` when the result says permanent.
- `removePinByAdmin` / `restoreCommunityPin` call `setPinRemoved` through the outbox too. An operator on a bad connection is still an operator.

- [ ] **Step 6: Seed the demo pins into the database**

Deleting `SEED_COMMUNITY_PINS` costs something the spec asked for: *"a fresh install already shows realistic mock activity (Phase 1 exit criteria) instead of an empty layer."* `supabase/seed/seed.sql` is 31 lines and seeds no pins, so without this step the community layer is simply empty.

The obstacle is that `community_pins.author_id` is now a real foreign key to `auth.users`, so a seed pin needs a real account. Per the spec: *"seeds need a designated seed account, created by the seed script and clearly marked. Seed rows must be distinguishable from real ones so a pilot can delete them."*

Extend `scripts/generate-seed.ts` (it already generates `supabase/seed/seed.sql` from `src/lib/mock-data/`) to emit:

1. One seed account with a **fixed, obviously-fake uuid** — `00000000-0000-4000-8000-00000000dead` — inserted into `auth.users` and `public.profiles`, with a comment saying what it is and that it must not survive into a pilot.
2. The two pins currently in `SEED_COMMUNITY_PINS`, with that uuid as `author_id` and their existing captions, coordinates and status tags. Their `id`s become fixed uuids in the same obviously-fake range, so the teardown is a literal id list rather than a guess.
3. A matching teardown block, `-- SEED TEARDOWN`, that deletes exactly those rows and that account.

The upvote/downvote counts on the current seed pins (`6/1` and `3/0`) **cannot be seeded as columns** — tallies are derived. Either seed the corresponding `pin_votes` rows against additional seed accounts, or seed the pins with no votes. Seeding fake voters to make a demo look busy is a decision, not a detail: **pick one, and say which in your report.** Whichever you pick, the vote rows must be inside the teardown too.

Run the seed against the live project, confirm `/api/pins` returns both pins with the tallies you expect, then **run the teardown** and confirm `community_pins`, `pin_votes` and `auth.users` are back to 0. Leaving demo barangays with fake reports in a real database is a liability the spec names explicitly.

- [ ] **Step 7: Update `use-pin-flow.ts`**

`handleConfirmDeletePin` and `handleEditPinSubmit` keep working unchanged if the store's signatures held. `handlePinFormSubmit` no longer passes `photoDataUrl`. Any call site of `isOwnPin(pin)` becomes `isOwnPin(pin, userId)`.

- [ ] **Step 8: Run the tests**

```bash
npx vitest run
```
Expected: PASS. Component tests that asserted on seeded local pins will fail — they were reading `SEED_COMMUNITY_PINS`. Move them to `renderWithData`'s fixture path or give them explicit pins; do not weaken an assertion to make it pass.

- [ ] **Step 9: Prove the tests bite**

For every test added in this task, break the named behaviour and confirm the named test fails. Pay particular attention to:

- the "ignores an entry belonging to another store" test — remove the operation filter from `mergePins`
- the "renders one row when an id is queued twice" test — remove the dedupe
- the zero-row UPDATE test — delete the `data.length === 0` branch
- the caption-length test — delete the validation

- [ ] **Step 10: Verify against the live database, then clean up**

Create one pin through the running app (`npm run build`, then the `weatherwell-prod` preview server; **never `npm run dev` through Bash**). Confirm through MCP that the row landed with `author_id` matching the anonymous user, `removed = false`, and a server-set `created_at`. Then delete the pin and the user, and confirm all tables read 0.

- [ ] **Step 11: Run all gates and commit**

```bash
npm run lint && npm run typecheck && npx vitest run && npx knip; echo "knip exit: $?"
npm run build
```

```bash
git add src/app/actions/action-result.ts src/app/actions/pins.ts src/app/actions/pins.test.ts src/app/api/pins src/lib/pins-mapper.ts src/lib/community-pins.ts src/lib/community-pins.test.ts src/lib/auth/anonymous-session.ts src/lib/types.ts src/lib/outbox/types.ts src/features/homepage-map/use-pin-flow.ts scripts/generate-seed.ts supabase/seed public/sw.js
git commit -m "feat(pins): put community pins in the database"
```

---

## Task 4: Votes — one per person, counted by the server

**Files:**
- Create: `src/app/actions/vote-on-pin.ts`, `src/app/actions/vote-on-pin.test.ts`
- Modify: `src/lib/community-pins.ts`, `src/lib/community-pins.test.ts`, `src/features/homepage-map/map-canvas.tsx`

**Interfaces:**
- Consumes: `MappedPin.ownVote` and the derived tallies from `/api/pins` (Task 3); `ActionResult` from `src/app/actions/action-result.ts` (Task 3)
- Produces:
  - `voteOnPin(input: { pinId, direction }): Promise<ActionResult>`
  - `dispatchQueuedVote(entry: OutboxEntry): Promise<void>`
  - `hasVotedOnPin(pin: CommunityPin): boolean` — reads `pin.ownVote`, takes no store

- [ ] **Step 1: Write the failing tests**

Add to `src/app/actions/vote-on-pin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, from }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: "voter-1" } } });
});

describe("voteOnPin", () => {
  it("upserts on (pin_id, voter_id) so changing a vote is not a duplicate", async () => {
    // The primary key is (pin_id, voter_id). A plain insert would collide the
    // moment a resident changes their mind, and — following the report
    // action's rule — 23505 would be reported as success while the vote
    // stayed as it was.
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert, select: vi.fn() });
    const { voteOnPin } = await import("./vote-on-pin");

    await voteOnPin({ pinId: "pin-1", direction: -1 });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ pin_id: "pin-1", voter_id: "voter-1", direction: -1 }),
      expect.objectContaining({ onConflict: "pin_id,voter_id" })
    );
  });

  it("attributes the vote to the uid from the verified claim, never to client input", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert, select: vi.fn() });
    const { voteOnPin } = await import("./vote-on-pin");

    await voteOnPin({ pinId: "pin-1", direction: 1 });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ voter_id: "voter-1" }),
      expect.anything()
    );
  });

  it("treats a foreign-key violation as TRANSIENT, because the pin may still be queued", async () => {
    // A resident creates a pin and votes on it with no signal. Both sit in
    // one queue, and on the next drain the vote may reach the server a
    // moment before its pin. Classifying 23503 permanent here — as every
    // other action correctly does — bins the vote for good.
    from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: { code: "23503", message: "fk" } }),
      select: vi.fn(),
    });
    const { voteOnPin } = await import("./vote-on-pin");

    const result = await voteOnPin({ pinId: "pin-1", direction: 1 });

    expect(result).toEqual({ ok: false, permanent: false, error: expect.any(String) });
  });

  it("rejects a direction that is neither 1 nor -1 without contacting the database", async () => {
    const { voteOnPin } = await import("./vote-on-pin");

    const result = await voteOnPin({ pinId: "pin-1", direction: 5 as 1 });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.any(String) });
    expect(from).not.toHaveBeenCalled();
  });
});
```

Add to `src/lib/community-pins.test.ts`:

```ts
describe("net-score removal", () => {
  it("removes a pin once downvotes exceed upvotes by the threshold", () => {
    // PRD Anti-Abuse layer 10. A well-corroborated pin is not killed by a
    // handful of bad-faith downvotes, so the test is on the MARGIN, not on
    // the downvote count.
    expect(exceedsRemovalThreshold({ upvotes: 0, downvotes: 5 })).toBe(true);
    expect(exceedsRemovalThreshold({ upvotes: 4, downvotes: 8 })).toBe(false);
  });
});

describe("hasVotedOnPin", () => {
  it("reads the caller's own vote off the pin", () => {
    expect(hasVotedOnPin(serverPin("pin-1", { ownVote: 1 }))).toBe(true);
    expect(hasVotedOnPin(serverPin("pin-1"))).toBe(false);
  });
});

describe("mergePins with a queued vote", () => {
  it("shows the resident their own queued vote immediately", () => {
    // Without this the button springs back to un-voted the instant they tap
    // it, and they tap again.
    const pin = serverPin("pin-1", { upvotes: 2 });
    const entry = enqueue("voteOnPin", { pinId: "pin-1", direction: 1 });

    const [merged] = mergePins([pin], [entry]);

    expect(merged.ownVote).toBe(1);
    expect(merged.upvotes).toBe(3);
  });

  it("does not double-count a queued vote the server already recorded", () => {
    const pin = serverPin("pin-1", { upvotes: 3, ownVote: 1 });
    const entry = enqueue("voteOnPin", { pinId: "pin-1", direction: 1 });

    const [merged] = mergePins([pin], [entry]);

    expect(merged.upvotes).toBe(3);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npx vitest run src/app/actions/vote-on-pin.test.ts src/lib/community-pins.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write the action**

Create `src/app/actions/vote-on-pin.ts`. It is `"use server"`.

- Validate `direction` is exactly `1` or `-1` before touching the database; anything else is `permanent: true`.
- `upsert({ pin_id, voter_id: userId, direction }, { onConflict: "pin_id,voter_id" })`. Task 2 left exactly `(pin_id, voter_id, direction)` insertable and `direction` updatable, so this is the only shape that works.
- **`23505` is not success here.** Say so in a comment, naming the report action's opposite rule and why it does not transfer.
- **`23503` is transient.** Say why, naming the queued-pin case.
- `42501` and `23514` stay permanent.

Then evaluate net-score removal **after** the write, in the same action:

```ts
// Layer 10 runs server-side now. It used to be computed in the browser from
// a local counter, which meant every device reached its own verdict from its
// own partial view of the votes. Reading the real tally back and deciding
// here is the only way one pin has one state.
const { data: tally } = await supabase
  .from("pin_votes")
  .select("direction")
  .eq("pin_id", input.pinId);

if (tally) {
  const upvotes = tally.filter((vote) => vote.direction === 1).length;
  const downvotes = tally.filter((vote) => vote.direction === -1).length;
  if (downvotes - upvotes >= NET_SCORE_REMOVAL_THRESHOLD) {
    // Soft delete, so an operator can restore a pin a brigading attack took
    // down wrongly — the same Human Override the alert pipeline has.
    await supabase
      .from("community_pins")
      .update({ removed: true, removed_reason: "net_score" })
      .eq("id", input.pinId);
  }
}
```

**That update runs as the voter, not as the pin's author.** RLS on `community_pins` allows UPDATE only to the author or an operator, so it will silently affect zero rows for anybody else's pin — which is every pin worth removing. Confirm this against the live database before writing the code, and if it is denied, the fix is a `SECURITY DEFINER` function in the `private` schema that performs the removal, called from the action. Apply the rules Plan 1 established for `private.is_operator()`: no arguments derived from client input beyond the pin id, and `set search_path = ''`.

**Do not revoke `EXECUTE` from `authenticated`.** Plan 1 shipped a draft that did, and it broke policy evaluation — `profiles_read_own_or_operator` calls `is_operator()` while running AS `authenticated`, so the revoke turned an ordinary own-row read into "permission denied for function". The settled shape revokes from `public` and `anon` only; the real protection is that schema `private` grants no `USAGE` to either role, so the name does not resolve at all. The comment at the top of `supabase/tests/rls.sql` records this. **Record which route you took and the evidence.**

`NET_SCORE_REMOVAL_THRESHOLD = 5`, and it must be defined in exactly one place that both the action and `exceedsRemovalThreshold` read. Put it in `src/lib/community-pin.ts` (already server-safe, no `"use client"`).

- [ ] **Step 4: Wire the store**

In `src/lib/community-pins.ts`:

- `voteOnPin(pinId, direction)` enqueues and triggers a drain. It no longer mutates any local tally.
- `hasVotedOnPin(pin: CommunityPin): boolean` returns `pin.ownVote !== undefined`. It takes the pin, not an id — the caller already has the pin in hand, and reading a store here is what the old version did.
- `exceedsRemovalThreshold({ upvotes, downvotes })` — pure, exported, used by the test and by nothing else in the client. If knip flags it, that is a real finding: either the client should be applying the same rule optimistically, or the export should go. Decide and say which.
- `mergePins` overlays a queued vote: `ownVote` becomes the queued direction, and the tally increments **only if the server row does not already report the caller's own vote in that direction**.
- `dispatchQueuedVote(entry)` replaces the Task 1 placeholder.

In `map-canvas.tsx`, `hasVotedOnPin(pin.id)` becomes `hasVotedOnPin(pin)`.

- [ ] **Step 5: Run the tests and prove they bite**

Break, for each: the `onConflict` option (drop it, making it a plain insert); the `23503` classification (flip to permanent); the direction validation; the net-score margin (use `downvotes >= 5` instead of the margin); `hasVotedOnPin`; the queued-vote double-count guard.

- [ ] **Step 6: Verify one vote per person against the live database**

Create two anonymous users. Have user A create a pin, both users vote, then have A vote again in the other direction. Confirm through MCP: `pin_votes` holds exactly two rows for that pin, and A's row shows the *second* direction. Then confirm A cannot change B's vote:

```sql
-- as A
update public.pin_votes set direction = -1 where pin_id = '<pin>' and voter_id = '<B>';
```

Expected: zero rows affected, no error. **Zero rows is the pass condition, and it is not the same as an error** — assert on the row count, because an UPDATE filtered away by RLS looks exactly like a successful no-op. Delete both users and all rows afterwards.

- [ ] **Step 7: Run all gates and commit**

```bash
git add src/app/actions/vote-on-pin.ts src/app/actions/vote-on-pin.test.ts src/lib/community-pins.ts src/lib/community-pins.test.ts src/lib/community-pin.ts src/features/homepage-map/map-canvas.tsx
git commit -m "feat(pins): count votes in the database, one per person"
```

---

## Task 5: Check-ins — the one response that must never be cached

**Files:**
- Create: `src/app/actions/record-check-in.ts`, `src/app/actions/record-check-in.test.ts`, `src/app/api/check-ins/route.ts`
- Modify: `src/lib/evacuation-checkins.ts`, `src/lib/evacuation-checkins.test.ts`, `public/sw.js`, `src/lib/service-worker.test.ts`

**Interfaces:**
- Consumes: `enqueue`, `payloadOf`, `flushOutbox`, `PermanentFailure`
- Produces:
  - `recordCheckIn(input: { id, zoneId, status }): Promise<ActionResult>`
  - `dispatchQueuedCheckIn(entry: OutboxEntry): Promise<void>`
  - `EvacuationCheckIn` with `userId: string` replacing `deviceId`
  - `mergeCheckIns(serverRows: EvacuationCheckIn[], queued: OutboxEntry[]): EvacuationCheckIn[]`

**A check-in names a person and says whether they need help.** RLS scopes the rows — a resident sees their own, an operator sees the zone's — but RLS cannot stop an HTTP cache from handing one device's response to another. This route is the one in the whole app that must never be stored.

- [ ] **Step 1: Write the failing tests**

`src/lib/service-worker.test.ts` evaluates the real `public/sw.js` in a `node:vm` sandbox with a fake Cache Storage and parses `VERSION` out of the source, so routine bumps do not break it. Add:

```ts
it("never writes a check-in response to any cache", async () => {
  // A check-in names a person and says whether they need help. RLS scopes
  // the rows; it cannot stop a shared cache handing one device's response to
  // another. This is the one route in the app that must not be stored.
  const { store, respond } = await load();

  await respond("https://weatherwell.test/api/check-ins");

  expect(store.size).toBe(0);
});

it("does not answer a check-in request from cache even when one is present", async () => {
  // The dangerous direction is the read, not the write: a response cached by
  // an older service worker version, or by anything else, must not be served.
  const { store, respond, seed } = await load();
  seed("weatherwell-api-v7", "https://weatherwell.test/api/check-ins", "STALE");

  const response = await respond("https://weatherwell.test/api/check-ins");

  expect(await response.text()).not.toBe("STALE");
});
```

Adapt `load`, `respond` and `seed` to the helpers that file already has — read it first. **The second test is the one that matters and it is easy to write vacuously**: if `seed` puts the entry in a cache the worker never consults anyway, it passes against a broken worker. Seed the cache the `/api/` branch actually reads, and prove it by making the check-ins branch fall through to that branch and watching this test fail.

Add to `src/lib/evacuation-checkins.test.ts`:

```ts
describe("mergeCheckIns", () => {
  it("shows a queued check-in immediately", () => {
    const entry = enqueue("recordCheckIn", { zoneId: "zone-1", status: "safe" });

    const merged = mergeCheckIns([], [entry]);

    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("safe");
  });

  it("replaces an earlier check-in for the same zone rather than adding one", () => {
    // The table is unique on (zone_id, user_id) and a resident is allowed to
    // change their answer. Two rows here would mean two people in a headcount
    // that an operator uses to decide who to go looking for.
    const existing = {
      id: "checkin-1",
      zoneId: "zone-1",
      userId: "user-1",
      status: "safe" as const,
      checkedInAt: new Date(Date.now() - 60_000).toISOString(),
    };
    const entry = enqueue("recordCheckIn", { zoneId: "zone-1", status: "needs_help" });

    const merged = mergeCheckIns([existing], [entry]);

    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("needs_help");
  });

  it("ignores an entry belonging to another store", () => {
    const entry = enqueue("createPin", {
      zoneId: "zone-1",
      statusTag: "flooded",
      caption: "Market",
      lat: 16.06,
      lng: 120.4,
    });

    expect(mergeCheckIns([], [entry])).toHaveLength(0);
  });
});
```

Add to `src/app/actions/record-check-in.test.ts`:

```ts
it("upserts on (zone_id, user_id) so changing safe to needs_help is not a duplicate", async () => {
  // The report action treats 23505 as success because a replayed report is
  // the same report. A check-in is not: a resident who said "safe" and now
  // needs help produces a second write on the same constraint, and swallowing
  // it as success would discard the most consequential message in the app.
  getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  from.mockReturnValue({ upsert });
  const { recordCheckIn } = await import("./record-check-in");

  await recordCheckIn({
    id: "22222222-2222-4222-8222-222222222222",
    zoneId: "zone-1",
    status: "needs_help",
  });

  expect(upsert).toHaveBeenCalledWith(
    expect.objectContaining({ zone_id: "zone-1", user_id: "user-1", status: "needs_help" }),
    expect.objectContaining({ onConflict: "zone_id,user_id" })
  );
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npx vitest run src/lib/service-worker.test.ts src/lib/evacuation-checkins.test.ts src/app/actions/record-check-in.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Write the action**

Create `src/app/actions/record-check-in.ts`, `"use server"`. Same shape as the others.

- `status` must be `"safe"` or `"needs_help"`; anything else is `permanent: true` before the database is touched.
- `upsert({ id, zone_id, user_id: userId, status }, { onConflict: "zone_id,user_id" })`.
- **`23505` is not success**, for the reason the test names.
- `23503` is permanent — a check-in names a zone, and a zone that does not exist never will.
- Missing session is transient.

- [ ] **Step 4: Write the route handler**

Create `src/app/api/check-ins/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";

/**
 * Check-ins, scoped by RLS: a resident receives only their own rows, an
 * operator receives their zone's.
 *
 * `no-store`, and it is not optional. A check-in names a person and says
 * whether they need help. RLS decides which ROWS a caller may read; it has no
 * opinion about who a cache hands the finished response to. `public/sw.js`
 * carries the matching early return, so both halves of the guarantee — the
 * network's caches and the device's — are explicit rather than assumed.
 *
 * Next 16 does not cache route handlers by default, so this header is
 * belt-and-braces against a CDN, a proxy, and a future default change.
 */
export async function GET() {
  const supabase = await createSupabaseUserClient();

  const { data, error } = await supabase
    .from("evacuation_check_ins")
    .select("id, zone_id, user_id, status, checked_in_at")
    .order("checked_in_at", { ascending: false })
    .limit(1000);

  const headers = { "Cache-Control": "no-store, no-cache, must-revalidate, private" };

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502, headers });
  }

  return NextResponse.json(
    data.map((row) => ({
      id: row.id,
      zoneId: row.zone_id,
      userId: row.user_id,
      status: row.status as "safe" | "needs_help",
      checkedInAt: row.checked_in_at,
    })),
    { headers }
  );
}
```

Write a test asserting the `Cache-Control` header is present on **both** the success and the 502 path. A 502 body is not sensitive, but a route with a conditional privacy header is a route where the condition eventually gets it wrong.

- [ ] **Step 5: Change `public/sw.js`**

Bump `VERSION` to `"v7"` — this task changes the fetch handler's routing, and the file's own header explains that a routing change requires it. Task 3 added `/api/pins` to the allowlist without bumping; this bump covers both.

Add the check-ins branch **before** the `/api/` allowlist branch:

```js
  // Check-ins name a person and say whether they need help. Straight to the
  // network, never stored, never answered from a store. This is deliberately
  // its own branch above the public-API allowlist rather than an omission
  // from that list: an omission would send it to the uncached default, which
  // is the same behaviour today but would silently change the day somebody
  // makes the default cache again.
  if (url.pathname === "/api/check-ins" || url.pathname.startsWith("/api/check-ins/")) {
    event.respondWith(fetch(request));
    return;
  }
```

- [ ] **Step 6: Rewrite the store**

`src/lib/evacuation-checkins.ts`:

- `EvacuationCheckIn.deviceId` becomes `userId: string`.
- Delete the `createLocalStorageStore` call and `getDeviceId`.
- `useEvacuationCheckIns()` fetches `/api/check-ins` on mount and after a delivering drain, following `water-level-reports.ts`. **This route is not cached**, so the cache-busting parameter and the warm-up request that `water-level-reports.ts` carries are unnecessary here — omit both and say why in a comment, so the next reader does not think they were forgotten.
- `mergeCheckIns(serverRows, queued)` — the three merge rules, plus the replace-by-`(zoneId, userId)` semantics the test names. Note that a queued entry has no `userId` yet (attribution happens at replay), so the replacement key for a queued entry is `zoneId` alone against the caller's own rows.
- `getCheckInsForZone` and `getOwnCheckInForZone` keep their signatures; `getOwnCheckInForZone` takes the uid as a parameter rather than reading a device id.
- `recordCheckIn(zoneId, status)` enqueues and triggers a drain.
- `dispatchQueuedCheckIn(entry)` replaces the Task 1 placeholder.

- [ ] **Step 7: Run the tests and prove they bite**

Break, at minimum:
- the sw.js check-ins branch — delete it entirely and confirm the "never writes" test fails
- the sw.js check-ins branch — delete it and confirm the "does not answer from cache" test fails **for the right reason** (it served STALE, not that it threw)
- the `onConflict` option on the upsert
- the `23505` classification — make it return `{ ok: true }`
- `mergeCheckIns`'s replace semantics — append instead

- [ ] **Step 8: Verify the privacy boundary against the live database**

Two anonymous users, A and B, each checking in to `zone-1`. Then, as A, read `/api/check-ins` and confirm **exactly one row** comes back — A's. Then promote a third user to `operator` in `profiles` and confirm they see both.

```sql
-- promote, then demote again in cleanup
update public.profiles set role = 'operator' where id = '<uid>';
```

Delete all three users, all check-ins, and confirm every table reads 0.

- [ ] **Step 9: Run all gates and commit**

```bash
git add src/app/actions/record-check-in.ts src/app/actions/record-check-in.test.ts src/app/api/check-ins src/lib/evacuation-checkins.ts src/lib/evacuation-checkins.test.ts public/sw.js src/lib/service-worker.test.ts
git commit -m "feat(check-ins): record check-ins server-side and never cache them"
```

---

## Task 6: The operator's decisions — alerts and centre capacity

This is the reason the whole slice exists. An operator downgrading an alert currently changes what the operator sees and nobody else.

**Files:**
- Create: `src/app/actions/set-zone-alert.ts`, `src/app/actions/set-zone-alert.test.ts`, `src/app/actions/set-center.ts`, `src/app/actions/set-center.test.ts`, one migration
- Modify: `src/lib/alerts-mapper.ts`, `src/lib/types.ts`

**Interfaces:**
- Consumes: `createSupabaseUserClient()`, `private.is_operator()`
- Produces:
  - `setZoneAlert(input: { zoneId, severity: Severity | "none" }): Promise<ActionResult>`
  - `setCenterStatus(input: { zoneId, status: CenterStatus }): Promise<ActionResult>`
  - `setCenterOccupancy(input: { zoneId, occupancy: number | null }): Promise<ActionResult>`
  - `AlertRecord.supersededSeverity?: Severity` — Task 7's layer 9 reads it

**Why these three do not go through the outbox.** Every other write in this plan is a resident's, made on a phone in a flood, and must survive losing signal. These are an operator's, made at a desk, and each is a *decision about current state* rather than an event. A queued downgrade replayed forty minutes later would re-apply a decision the situation has moved past — and worse, would silently reverse a newer decision made in between. They call the action directly and report failure to the operator, who can retry when they can see whether it is still the right call. **Write that reasoning in a comment in each file**; "we forgot the outbox here" is the obvious wrong reading.

- [ ] **Step 1: Write the failing tests**

`src/app/actions/set-zone-alert.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaims = vi.fn();
const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/user-server", () => ({
  createSupabaseUserClient: async () => ({ auth: { getClaims }, rpc, from }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setZoneAlert", () => {
  it("records what the new alert replaced, so the downgrade can be explained", async () => {
    // superseded_severity is what makes layer 9 need no join and no history
    // walk. Without it, a resident who was told to evacuate and then sees an
    // Advisory badge has no way to learn that a person made that decision.
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    rpc.mockResolvedValue({ error: null });
    const { setZoneAlert } = await import("./set-zone-alert");

    await setZoneAlert({ zoneId: "zone-1", severity: "yellow" });

    expect(rpc).toHaveBeenCalledWith("set_zone_alert", expect.objectContaining({
      p_zone_id: "zone-1",
      p_severity: "yellow",
    }));
  });

  it("refuses a severity that is not one of the four", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "operator-1" } } });
    const { setZoneAlert } = await import("./set-zone-alert");

    const result = await setZoneAlert({ zoneId: "zone-1", severity: "purple" as "yellow" });

    expect(result).toEqual({ ok: false, permanent: true, error: expect.any(String) });
  });
});
```

- [ ] **Step 2: Write the database function**

The spec calls for a single transaction, because `alerts_one_active_per_zone` forbids two active alerts for a zone: deactivate-then-insert as two round trips leaves a window where a concurrent insert wins and the second statement fails.

Iterate with `execute_sql`, then apply as a migration:

```sql
create or replace function public.set_zone_alert(
  p_zone_id  text,
  p_severity text,
  p_message  jsonb
)
returns void
language plpgsql
security invoker          -- the OPERATOR's own privileges; RLS still applies
set search_path = ''
as $$
declare
  v_previous text;
begin
  -- The whole point of doing this in one function: between the update and
  -- the insert there is no window for a second active alert to appear.
  update public.alerts
     set is_active = false, superseded_at = now()
   where zone_id = p_zone_id and is_active
  returning severity into v_previous;

  if p_severity is not null then
    insert into public.alerts
      (zone_id, severity, message, source, confidence, superseded_severity)
    values
      (p_zone_id, p_severity, p_message, 'manual', 'validated', v_previous);
  end if;
end;
$$;

revoke execute on function public.set_zone_alert(text, text, jsonb) from public, anon;
grant  execute on function public.set_zone_alert(text, text, jsonb) to authenticated;
```

**`security invoker`, not `definer`.** A `SECURITY DEFINER` function in `public` is a callable endpoint that bypasses RLS — exactly the trap Plan 1 hit with `is_operator`. Invoker means the alerts policies still decide, so a resident calling this directly writes nothing. **Prove that**: call it as a resident and confirm the insert is refused, and call it as an operator and confirm it succeeds. `revoke ... from public, anon` is defence in depth, not the guarantee.

A null `p_severity` is the "none" case — deactivate and insert nothing.

Apply it, reconcile the name against `list_migrations`, and write the local migration file to match.

- [ ] **Step 3: Write the actions**

`src/app/actions/set-zone-alert.ts`:

- Validate `severity` against `SEVERITY_ORDER` plus `"none"`. Anything else is permanent.
- Build the message with the **generated copy for the new severity**, using `genericOverrideMessage`'s logic from `zone-overrides.ts` — move that function into `src/lib/severity.ts` (already server-safe) rather than leaving it behind in a file Task 7 deletes. Rename it `manualAlertMessage(severity)` since "override" is no longer what it is.
- **Copy written for one severity never survives onto another.** The database now enforces this structurally: a new severity is a new row, and a new row gets its own copy. Say so in a comment — this used to take careful client-side reasoning and now takes none, which is worth recording so nobody re-adds the reasoning.
- Call `supabase.rpc("set_zone_alert", { p_zone_id, p_severity, p_message })`. For `"none"`, pass `p_severity: null`.
- `42501` is permanent. Everything else is permanent too, because there is no queue to retry into: report the failure to the operator.

`src/app/actions/set-center.ts`:

- `setCenterStatus` updates `evacuation_centers.status` where `zone_id` matches.
- `setCenterOccupancy` updates `current_occupancy`; `null` clears it, falling back to the manual status.
- Occupancy must be a non-negative integer or `null`; anything else is permanent, rejected before the database.
- **Both must check for zero affected rows.** These are UPDATEs against a policy that only operators satisfy, and a denied UPDATE returns zero rows and no error. A resident calling `setCenterStatus` would otherwise be told it worked.

- [ ] **Step 4: Carry `supersededSeverity` onto `AlertRecord`**

In `src/lib/types.ts`, add to `AlertRecord`:

```ts
  /**
   * The severity this alert replaced, or undefined if it replaced nothing.
   * Set by the database when an operator changes a zone's alert; layer 9
   * reads it to explain a downgrade without a join or a history walk.
   */
  supersededSeverity?: Severity;
```

In `src/lib/alerts-mapper.ts`, map it: `supersededSeverity: row.superseded_severity ?? undefined`. The route handler already selects the column and already narrows it — Plan 2 fetched it deliberately for a consumer that did not exist yet. Delete the comment in `/api/alerts/route.ts` saying the mapper intentionally does not map it; that is no longer true.

- [ ] **Step 5: Run the tests and prove they bite**

Break: the severity validation; the `rpc` name; the zero-row check on each centre action; the `supersededSeverity` mapping.

- [ ] **Step 6: Verify against the live database**

Promote one user to operator. Then, as that operator:

1. Set `zone-1` to `red`. Confirm one active row, `superseded_severity` null, `issued_by` = the operator's uid.
2. Set `zone-1` to `yellow`. Confirm **exactly one** active row, its `superseded_severity` is `red`, and the old row has `is_active = false` with `superseded_at` set.
3. Set `zone-1` to `none`. Confirm zero active rows for the zone and the yellow row now has `superseded_at`.
4. As a **resident**, call `set_zone_alert` directly and confirm nothing is written.
5. As a resident, call `setCenterOccupancy` and confirm zero rows affected.

Delete every alert row and user afterwards; confirm all tables read 0.

- [ ] **Step 7: Run all gates and commit**

```bash
git add src/app/actions/set-zone-alert.ts src/app/actions/set-zone-alert.test.ts src/app/actions/set-center.ts src/app/actions/set-center.test.ts src/lib/types.ts src/lib/alerts-mapper.ts src/lib/severity.ts src/app/api/alerts/route.ts supabase/migrations
git commit -m "feat(alerts): make an operator's decision reach residents"
```

---

## Task 7: The collapse — delete `zone-overrides.ts` and `device-id.ts`

This is the task that can silently regress behaviour already shipped. It is also the one that closes the stale-override finding, and the closure is a deletion.

**The finding, stated plainly.** `useZoneOverrides` reads `weatherwell.zoneOverrides`, which persists forever. Since Plan 2 made alerts real, a resident's device that recorded `alertSeverity: "none"` last week suppresses **every** subsequent alert for that zone, including a new evacuate order from the server. A stale local override outranking a live emergency alert is the most serious defect this branch has carried, and it survives for exactly as long as `resolveEffectiveAlert` does.

**Files:**
- Delete: `src/lib/zone-overrides.ts`, `src/lib/zone-overrides.test.ts`, `src/lib/device-id.ts`
- Create: `src/lib/alert-downgrade.ts`, `src/lib/alert-downgrade.test.ts`, `src/lib/retired-storage.ts`
- Modify: `src/lib/center-status.ts`, the thirteen consumer files listed in File Structure, `src/app/layout.tsx`
- Modify: `src/features/homepage-map/personal-status-headline.test.tsx`, `src/features/homepage-map/use-route-finding.test.ts`, `src/features/alerts/alert-downgrade-notice.tsx` and its test

**Interfaces:**
- Consumes: `AlertRecord.supersededSeverity` (Task 6), `useAlerts()` (Plan 2)
- Produces:
  - `resolveAlertDowngrade(alertsForZone: AlertRecord[]): AlertDowngradeNotice | undefined`
  - `deriveCenterStatusFromOccupancy`, `resolveEffectiveCenterStatus` — moved verbatim into `center-status.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/alert-downgrade.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveAlertDowngrade } from "./alert-downgrade";
import type { AlertRecord } from "./types";

const alert = (over: Partial<AlertRecord>): AlertRecord => ({
  id: "a1",
  zoneId: "zone-1",
  severity: "yellow",
  message: { en: "", fil: "" },
  source: "manual",
  confidence: "validated",
  issuedAt: new Date().toISOString(),
  isActive: true,
  ...over,
});

describe("resolveAlertDowngrade", () => {
  it("announces a downgrade the operator made", () => {
    const notice = resolveAlertDowngrade([
      alert({ severity: "yellow", supersededSeverity: "evacuate" }),
    ]);

    expect(notice).toEqual({ from: "evacuate", to: "yellow" });
  });

  it("announces an alert that was lifted entirely", () => {
    // The case this exists for. With no active alert the badge simply stops
    // being rendered, and silence is exactly how a resident who has been told
    // to evacuate would experience an operator error, a bad automated
    // trigger, and a genuine all-clear — three very different situations that
    // must not look identical.
    const notice = resolveAlertDowngrade([
      alert({ severity: "evacuate", isActive: false }),
    ]);

    expect(notice).toEqual({ from: "evacuate", to: "none" });
  });

  it("says nothing about an escalation", () => {
    // Raising an alert already announces itself in the loudest way the
    // interface has. Only the quiet direction needs words.
    const notice = resolveAlertDowngrade([
      alert({ severity: "evacuate", supersededSeverity: "yellow" }),
    ]);

    expect(notice).toBeUndefined();
  });

  it("says nothing when an alert replaced nothing", () => {
    expect(resolveAlertDowngrade([alert({ severity: "red" })])).toBeUndefined();
  });

  it("says nothing for a zone with no alerts at all", () => {
    expect(resolveAlertDowngrade([])).toBeUndefined();
  });

  it("reads the newest alert, not whichever came first in the array", () => {
    const older = alert({ id: "old", severity: "red", isActive: false, issuedAt: "2026-09-01T00:00:00Z" });
    const newer = alert({ id: "new", severity: "yellow", supersededSeverity: "red", issuedAt: "2026-09-08T00:00:00Z" });

    expect(resolveAlertDowngrade([older, newer])).toEqual({ from: "red", to: "yellow" });
  });
});
```

That last test is the one that catches an implementation trusting the route's ordering. **Write it to fail against an implementation that reads `alertsForZone[0]`** — pass the array oldest-first, as above.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/lib/alert-downgrade.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `alert-downgrade.ts`**

```ts
import { SEVERITY_ORDER, type Severity } from "./severity";
import type { AlertRecord } from "./types";

/**
 * A downgrade the resident is owed an explanation for — PRD Anti-Abuse layer
 * 9 ("Transparent downgrade"), the counterpart to layer 7's human override.
 */
export interface AlertDowngradeNotice {
  /** What the zone's alert said before the operator acted. */
  from: Severity;
  /** What it says now, or "none" if the alert was withdrawn entirely. */
  to: Severity | "none";
}

/**
 * The downgrade notice for a zone, from that zone's alerts.
 *
 * THE RECENCY WINDOW IS NOT HERE. `/api/alerts` returns active alerts plus
 * those superseded within six hours, so a superseded row reaching this
 * function is recent by construction. That keeps the window in one constant
 * as the spec requires — but it also means a caller who ever gets alerts from
 * somewhere other than that route loses it silently, and would tell a
 * resident an alert was just lifted two days after the fact. If a second
 * source of alerts ever appears, the window moves in here.
 */
export function resolveAlertDowngrade(
  alertsForZone: AlertRecord[]
): AlertDowngradeNotice | undefined {
  if (alertsForZone.length === 0) return undefined;

  // Sorted here rather than trusting the caller. The route does order by
  // issued_at desc, but this function is pure and used in loops, and a
  // consumer that filters or concatenates has already broken that order
  // without noticing.
  const newest = [...alertsForZone].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
  )[0];

  if (!newest.isActive) {
    // No active alert, and this row is inside the route's window: the alert
    // was withdrawn.
    return { from: newest.severity, to: "none" };
  }

  if (!newest.supersededSeverity) return undefined;

  const isLower =
    SEVERITY_ORDER.indexOf(newest.severity) < SEVERITY_ORDER.indexOf(newest.supersededSeverity);

  return isLower ? { from: newest.supersededSeverity, to: newest.severity } : undefined;
}
```

- [ ] **Step 4: Move the two pure centre functions**

Cut `deriveCenterStatusFromOccupancy` and `resolveEffectiveCenterStatus` — **and their full comments, verbatim** — from `zone-overrides.ts` into `src/lib/center-status.ts`. Both are already pure and have no storage dependency, which is why they survive; the comments explain why their arguments are required rather than optional, and that reasoning cost a real bug to learn.

`resolveEffectiveCenterStatus`'s `override` parameter now comes from the database rather than a local store: it is `evacuation_centers.status`, which the zone's own `centerStatus` already carries through `/api/zones`. Check whether the parameter still earns its place. If `zoneDefault` and `override` are now always the same value, **collapse the signature to three parameters** and update the six call sites — a parameter that can only ever equal another parameter is a trap for the next reader. Record which you found.

- [ ] **Step 5: Delete the two modules and fix the thirteen consumers**

Delete `src/lib/zone-overrides.ts`, `src/lib/zone-overrides.test.ts` and `src/lib/device-id.ts`.

In each consumer, the transformation is a **deletion**, not a substitution:

```diff
-const overrides = useZoneOverrides();
-const alert = resolveEffectiveAlert(zone.id, overrides[zone.id]?.alertSeverity, base);
+const alert = base;
```

Where `base` came from `useActiveAlertForZone(zoneId)`, use that directly. Where it came from a `useAlerts()` loop, keep the loop.

For the two admin write sites:
- `setZoneAlertOverride(zone.id, value)` → `await setZoneAlert({ zoneId: zone.id, severity: value === "auto" ? "none" : value })`. **The "auto" option disappears from the select**: there is no longer an automatic alert to fall back to, only the alert that exists. Removing an option a user could pick is a behaviour change; make it, and say so in your report.
- `setZoneCenterStatusOverride` → `setCenterStatus`; `setZoneOccupancyOverride` → `setCenterOccupancy`.

Both are now `async` and both return a result. **An operator whose write failed must be told.** Do not fire-and-forget: show the failure next to the control that produced it, in both languages.

For `personal-status-headline.tsx` and `evacuation/page.tsx`, `resolveAlertDowngrade(zone.id, override, base)` becomes `resolveAlertDowngrade(useAlerts().filter((a) => a.zoneId === zone.id))`. Hoist the `useAlerts()` call — never call a hook inside a loop.

- [ ] **Step 6: Sweep the retired localStorage keys**

Create `src/lib/retired-storage.ts`:

```ts
"use client";

/**
 * Keys this app used to write and no longer reads.
 *
 * Leaving them is not harmless. `weatherwell.zoneOverrides` in particular
 * held an operator decision that used to outrank the server's alert for that
 * device — the reason it is gone. The others hold a resident's own pins,
 * votes and check-ins from before any of it was shared.
 *
 * Those local pins are NOT migrated to the server, and that is a decision
 * rather than an omission: they were written with no identity that can be
 * attributed, so uploading them would either invent an author or attach a
 * stranger's content to whoever happens to hold the device now.
 */
const RETIRED_KEYS = [
  "weatherwell.zoneOverrides",
  "weatherwell.communityPins",
  "weatherwell.communityPinVotes",
  "weatherwell.evacuationCheckIns",
  "weatherwell.waterLevelReports",
  "weatherwell.deviceId",
];

export function clearRetiredStorage(): void {
  for (const key of RETIRED_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Blocked or full storage. There is nothing to do and nothing at
      // stake: nothing reads these keys any more.
    }
  }
}
```

Mount it from a tiny client component in `src/app/layout.tsx`, beside `<OutboxDrain />`. **It must not touch `weatherwell.onboarded`, `weatherwell.selectedZoneId` or `weatherwell.outbox`** — the first two are deliberately local, and the third holds writes that have not been delivered yet. Write a test asserting all three survive the sweep, and prove it bites by adding one of them to `RETIRED_KEYS`.

- [ ] **Step 7: Make the layer 9 regression tests pass without weakening them**

`src/features/alerts/alert-downgrade-notice.tsx` and its test are the acceptance criterion for this task, per the spec: *"the test that proves a cleared alert still announces itself is the acceptance criterion for that step, not an afterthought."*

The component's props change from `(from, to)` derived from an override to the same `AlertDowngradeNotice` derived from `supersededSeverity`. **Its rendered output must not change at all.** The existing test that guards against a reason appearing in the copy (`/threshold|water level/i`) stays exactly as it is.

`personal-status-headline.test.tsx` and `use-route-finding.test.ts` call `setZoneAlertOverride` to set up their scenarios. Rewrite them to pass alerts through `renderWithData`'s `alerts` option instead. **Do not delete an assertion to make a test pass.** If a test genuinely cannot be expressed against the new source, say so in your report and leave it failing rather than removing it — that is a ruling for the controller.

- [ ] **Step 8: Prove the stale-override finding is closed**

Write a test that would have caught it:

```ts
it("shows a new server alert even on a device that once stored a cleared override", () => {
  // The finding this task closes. A device that recorded {"zone-1":
  // {"alertSeverity":"none"}} last week used to suppress every later alert
  // for that zone, including a new evacuate order. Nothing reads that key any
  // more, and this test is what keeps it that way.
  localStorage.setItem(
    "weatherwell.zoneOverrides",
    JSON.stringify({ "zone-1": { alertSeverity: "none" } })
  );

  renderWithData(<PersonalStatusHeadline />, {
    alerts: [/* an active evacuate alert for zone-1 */],
  });

  expect(screen.getByText(/evacuate/i)).toBeInTheDocument();
});
```

Fill in the alert fixture from `mock-fixtures.ts`. **Prove it bites** by restoring the old resolver behind it temporarily — a one-line `if (stored?.alertSeverity === "none") return undefined;` in the component — and confirming this test fails.

- [ ] **Step 9: Run the tests**

```bash
npx vitest run
```
Expected: PASS. This is the largest diff in the plan; expect a long tail of component tests that mounted the override store. Fix each at the fixture, not the assertion.

- [ ] **Step 10: Run all gates and commit**

```bash
npm run lint && npm run typecheck && npx vitest run && npx knip; echo "knip exit: $?"
npm run build
```

```bash
git add -u
git add src/lib/alert-downgrade.ts src/lib/alert-downgrade.test.ts src/lib/retired-storage.ts src/components
git commit -m "refactor(alerts): delete the override store that outranked real alerts"
```

Check `git status` before committing: `.claude-sessions/` is untracked and stays that way.

---

## Task 8: The RLS denial suite

Every task above asserted its own denials in passing. This task gathers them into one runnable suite, because a denial proved once during implementation is not a regression test.

**Files:**
- Modify: `supabase/tests/rls.sql` (442 lines, created by Plan 1 — **extend it, do not replace it**)
- Create: `docs/superpowers/rls-testing.md`

**What already exists.** Plan 1 built `supabase/tests/helpers.sql` with five helpers. Read it before writing anything:

| Helper | Use |
|---|---|
| `tests.as_user(user_id uuid)` | Records the impersonation the next `expect_*` call runs under. **It does not itself switch the ambient role** — a plain top-level statement needs its own `set local role`. |
| `tests.as_anon()` | Same, for an unauthenticated caller. |
| `tests.expect_denied(label, stmt)` | Asserts the statement raises. |
| `tests.expect_allowed(label, stmt)` | The other half of every pair. |
| `tests.expect_row_count(label, query, expected)` | **The one for a silently-filtered write.** An UPDATE refused by RLS returns zero rows and no error, so `expect_denied` would fail on it — Plan 1 was caught by exactly this. |

Read the existing assertions too: several carry comments recording what an earlier draft got wrong, and repeating those mistakes is the cheapest failure available here.

**Scope note.** The spec's step 8 also wires a Supabase service container into CI. That is deferred to Plan 5 along with the operator PIN gate — this task produces a suite a human or an agent runs through the MCP against the live project, which is what Plans 1 and 3 already did ad hoc.

- [ ] **Step 1: Extend the suite**

Append to `supabase/tests/rls.sql`, in its established style: plain SQL, each assertion raising on failure, each with a comment naming the trap it guards. Assertions 1-10 below may already exist in some form — **check before writing, and strengthen rather than duplicate.** Assertions 11-14 are new, and 11 and 12 are the ones Task 2 created the need for.

The suite must cover, at minimum:

| # | Assertion | Trap |
|---|---|---|
| 1 | A resident cannot insert or update an `alerts` row | operator-only writes |
| 2 | A resident cannot vote twice on one pin | `(pin_id, voter_id)` primary key |
| 3 | A resident cannot change another person's vote | `USING` without `WITH CHECK` |
| 4 | A resident cannot read another resident's check-in | the privacy boundary |
| 5 | An operator can read their zone's check-ins | the other half of #4 — a policy that denies everyone is not correct |
| 6 | A resident cannot write to `zones`, `evacuation_centers`, `points_of_interest`, `hazard_susceptibility` | reference data |
| 7 | A resident cannot update a pin to reassign `author_id` | the `WITH CHECK` trap |
| 8 | A resident cannot set `profiles.role` to `operator` | self-promotion |
| 9 | An anonymous user is refused everywhere a resident is | anonymous users carry the `authenticated` role |
| 10 | `private.is_operator()` is not directly callable by `anon` or `authenticated` | `SECURITY DEFINER` in a reachable schema |
| 11 | A resident cannot set `community_pins.removed` | **column grants, Task 2** |
| 12 | A resident cannot backdate `created_at`, `voted_at` or `checked_in_at` | column grants |
| 13 | `public.set_zone_alert` writes nothing when a resident calls it | `security invoker` |
| 14 | A resident cannot update `evacuation_centers.current_occupancy` | operator-only |

**Assertions 5 and the positive half of each pair are not optional.** A policy set that denies everything passes every denial test and is useless. Every denial in the suite is paired with the corresponding permission.

- [ ] **Step 2: Prove the suite catches a real regression**

For at least four assertions — chosen to span RLS policies, column grants, and the function's `security invoker` setting — temporarily reverse the protection in the database, run the suite, confirm **that** assertion fails, and restore. Assertions 3, 7, 11 and 13 are the recommended four. Record what you reversed and what failed.

A suite that has never failed has never been tested.

- [ ] **Step 3: Write the runbook**

`docs/superpowers/rls-testing.md` — how to run the suite through the MCP, what a pass looks like, how to clean up afterwards, and one paragraph stating plainly that **`get_advisors` is not a substitute**: its `auth_allow_anonymous_sign_ins` lint reads `USING` clauses and is blind to `WITH CHECK`, so it can never flag a broken INSERT policy, and its silence on a write path is incidental rather than reassuring.

- [ ] **Step 4: Clean up and commit**

Delete every user and row the suite created; confirm all six tables read 0.

```bash
git add supabase/tests docs/superpowers/rls-testing.md
git commit -m "test(rls): gather the denial assertions into one suite"
```

---

## Task 9: Prove it end to end, and update the PRD

**Files:**
- Modify: `PRD.md`
- Modify: `src/features/homepage-map/community-pin-form.tsx`

- [ ] **Step 1: Build and serve**

```bash
npm run build
```

Then start the `weatherwell-prod` preview server through the browser preview tooling. **Never run a dev server through Bash.**

- [ ] **Step 2: Prove the thing the whole slice exists for**

Two browser profiles, A and B, both on the same zone.

1. As A, drop a pin. Confirm it appears for A immediately.
2. As B, reload. **B sees A's pin.** This is the sentence the slice was written for.
3. As B, downvote it. As A, reload — A sees the downvote.
4. As an operator, set the zone to `evacuate`. As A **and** B, reload. Both see it.
5. As the operator, downgrade to `yellow`. Both residents see the badge change **and the downgrade notice**, and neither is told a reason — the notice states what changed, not why.
6. As the operator, clear the alert. Both see "Alert lifted".

Record each step's outcome. If any of them fails, that is the finding, not a step to retry until it passes.

- [ ] **Step 3: Prove the offline path still holds for the new stores**

With the server stopped: drop a pin and record a check-in. Both appear immediately, no error is shown, and `localStorage["weatherwell.outbox"]` holds two entries. Confirm through MCP that neither reached the database. Restart, dispatch `online` **without reloading**, and confirm both land under their own client-generated ids.

Then re-queue one delivered entry by hand and drain again. Confirm exactly one row survives.

- [ ] **Step 4: Prove the check-in privacy boundary in the browser, not just in SQL**

As A, check in. As B, open `/api/check-ins` directly. **B must not see A's row.** Then confirm through the browser's Cache Storage that no `weatherwell-` cache contains a `/api/check-ins` entry.

- [ ] **Step 5: Fix the last stale copy**

`src/features/homepage-map/community-pin-form.tsx` says *"Stays on this device only — never uploaded."* That was true until this plan and is now false. Rewrite it in both languages: the pin is shared with the barangay; the **photo** is the part that stays on the device, because pin photos going live is deliberately out of scope pending the consent and retention rules. Say exactly that, since it is both more accurate and more reassuring than what it replaces.

- [ ] **Step 6: Update the PRD**

The spec names four changes this slice requires. Make all four:

- **Build Status** — new rows for pins, votes, check-ins and operator alerts. `All data | Mock` retires. Re-check every row against the code; that table is dated and drifts the moment code changes.
- **Anti-Abuse layer 5** — from a client-generated random ID to a server-issued anonymous auth identity. State it as the improvement it is: the identity is now issued and verified by the server rather than generated by the client and clearable at will.
- **Architecture → Backend** — name that `pin_votes` tallies are derived rather than stored, and describe the `profiles` role model.
- **Privacy & Data** — anonymous auth creates a persistent per-device identity where the PRD currently describes a random local ID. Add a retention row for anonymous users.

And one the spec does not name but this plan creates: **check-ins are the one response the app never caches**, and the reason is a privacy position rather than a technical one. The PRD already flags an outstanding RA 10173 review; this belongs in it.

**Constraint:** the IDEA was submitted early and can no longer be edited. The PRD must not contradict or wander from it.

- [ ] **Step 7: Clean up the database**

```sql
delete from public.pin_votes;
delete from public.community_pins;
delete from public.evacuation_check_ins;
delete from public.water_level_reports;
delete from public.alerts where source = 'manual';
delete from auth.users where is_anonymous;
update public.profiles set role = 'resident' where role = 'operator';
```

Then confirm every table reads 0 and no profile is an operator.

- [ ] **Step 8: Run all gates and commit**

```bash
npm run lint && npm run typecheck && npx vitest run && npx knip; echo "knip exit: $?"
npm run build
```

```bash
git add PRD.md src/features/homepage-map/community-pin-form.tsx
git commit -m "docs(prd): record that the shared stores are now actually shared"
```

**Do not push.** The push is the human partner's call.

---

## Carried forward to Plan 5

Recorded here so they are not rediscovered:

- **Operator PIN gate.** An unauthenticated `/admin` against a shared database can change what a whole barangay is told. The spec says this "must ship before any real deployment". Task 6 makes it urgent rather than theoretical: before this plan, an unauthorised `/admin` visitor could only mislead themselves.
- **CI Supabase service container**, so Task 8's suite runs on every push instead of on request.
- **Nothing bounds cross-drain retries.** `entry.attempts` is written by `markFailed` and read by nobody. A permanently-broken transient failure retries forever.
- **A queued/pending/failed indicator.** Deliberately deferred from Plan 3, and now four more stores queue writes with no way for a resident to see one is still waiting.
- **`agreeing` counts rows, not distinct reporters**, so one person filing three reports moves a threshold meant to require three people.
- **`/api/reports` has a global 200-row limit with no zone filter**, so a busy barangay can push a quiet one's reports off the end.
- **An admin row mixes the real agreeing count with mock `getReportsTodayForZone`.**
- **Anonymous auth rows accumulate** with no automatic reaping. A scheduled cleanup of anonymous users with no rows attached is needed before pilot scale.
- **Error and uptime monitoring**, which the spec scoped out of this slice.

### Found during execution

Surfaced while this plan ran, recorded here because the execution ledger is scratch that gets deleted:

- **Net-score removal can bury a true pin before anyone corroborates it.** Removal is correctly one-directional — a reversible version would let a coordinated group toggle a pin's visibility at will, and it is what stops a net-score verdict overwriting an operator's own removal. But a truthful "road impassable" pin downvoted five times in its first minute is hidden until an operator happens to look. Fix without making removal reversible: make a fresh pin ineligible for net-score removal until a minimum time has passed or a minimum number of votes exists, and give the operator a queue of `net_score` removals to review.
- **Operator edits do not refresh their own screen.** A capacity or occupancy edit, and the admin zone page's severity badge, show the old value until a reload, because the local store that made this instant is gone and the reference-data provider exposes no refresh. No wrong data is shown; it is stale until reload.
- **Delivered writes are held for a component's lifetime.** Delivered edits, votes, moderation writes and check-ins are kept as optimistic rows and never released, because they never share an id with a server row. Nothing wrong is displayed. Release them once the post-delivery refetch lands — sound now that that refetch is guaranteed fresh.
- **`refreshCachedPins` is redundant.** The service worker now stores the post-write refetch under the plain `/api/pins` key, so this extra request duplicates it. Remove it, as was already done for reports.
- **`/api/pins` is fetched once per mounting component.** `/admin` makes two identical requests. One shared provider across the stores would fix it.
- **The offline pin path is not proven end to end through the real form.** The drain was proven end to end, and `addCommunityPin`'s enqueue is covered by unit tests, but filing a pin through `CommunityPinForm` while `fetch` is genuinely failing has not been exercised. (Check-ins were driven through the real UI.)
- **Pin photo display code is now unreachable.** The form no longer collects a photo, so `PhotoLightbox`, the popup thumbnails, `CommunityPin.photoDataUrl` and `public/mock/community-pin-example.jpg` are dead weight. Remove them, or build the upload path once the consent and retention rules allow it.
- **Small tidy-ups:** `CheckInPanel` mounts `useSessionUserId` twice; the net-score migration's comment still names a deleted TypeScript constant; one `rls.sql` comment miscounts the inserts that follow it.
