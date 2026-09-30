# Residents' data rights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A resident can download everything WeatherWell holds about them, and delete it: reports anonymised, pins detached with their photos deleted, everything else and the account deleted.

**Architecture:** A route reads the resident's own rows with their session, plus one `security definer` function for the report positions RLS hides from them. A `security definer` function anonymises and deletes in one transaction and returns the photo paths; a Server Action then deletes the photos and the account with the service role. A card in Settings offers both, and after deleting it signs out and forgets this phone's queue and onboarding.

**Tech Stack:** Postgres (Supabase), plpgsql, Supabase Auth admin API and Storage API (service role), Next.js 16 route handlers and Server Actions, React 19, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-residents-data-rights-design.md`

## Global Constraints

- Deleting keeps water-level reports, **anonymised**: `reporter_id`, `lat`, `lng` and `located` set to null; depth, barangay and times stay.
- Pins stay, detached (`author_id` null), their photos deleted now; votes, check-ins, push and email alert subscriptions, security questions, recovery attempts and the account are deleted.
- Officials (`role = 'operator'`) and the admin cannot use it: refused in the database and the card is hidden.
- The export never includes another resident's rows or the security answers, and names the file `weatherwell-my-data.json`.
- Deleting asks the resident to type DELETE.
- The consent notice is not changed.
- Copy is bilingual (`LocalizedText`).
- Migrations are applied with `apply_migration`, files renamed to the reported versions, types updated in `database.types.ts`, and checked once on live in a block that ends in an exception.
- The service worker `VERSION` goes up once per release, in the release commit, not in this plan.
- Commits are authored by the owner alone: no `Co-Authored-By` lines.

## Review Focus

1. A resident who has already deleted, pressing again, or a double tap: the second call finds nothing and must not fail halfway. Test: DR5 (the function twice) and Task 3's "account already gone" case.
2. A pin the resident placed that a moderation trigger protects (`pins_protect_moderation_columns`): detaching the author must not be refused. Test: DR2 on a removed pin.
3. A report the crowd engine counted for a live advisory: once anonymised it must stop counting, and the advisory must not break. Test: DR3.
4. The export for an account with nothing: every section present and empty, not an error. Test: Task 2's empty case.
5. The storage delete failing after the database changed: the account is still deleted and the orphaned photos are left to the daily cleanup (an unattached upload older than an hour). Test: Task 3's storage-failure case.

---

### Task 1: The database side

**Files:**
- Create: `supabase/migrations/<version>_residents_data_rights.sql`
- Modify: `supabase/tests/accounts.sql` (block DR), `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: `water_level_reports`, `community_pins`, `pin_votes`, `evacuation_check_ins`, `private.recovery_attempts`, `public.profiles`.
- Produces:
  - `water_level_reports.reporter_id` and `community_pins.author_id` lose `not null` (their foreign keys to `auth.users` stay).
  - `public.my_report_positions() returns table (id uuid, lat double precision, lng double precision)`, `security definer`, the caller's own reports only.
  - `public.delete_my_data() returns text[]`, `security definer`, for `auth.uid()` only: refuses `null` callers and non-residents with `42501`; anonymises reports; collects the caller's pins' non-null `photo_path`s, then sets `author_id` and `photo_path` to null; deletes their `pin_votes`, `evacuation_check_ins` and `private.recovery_attempts` for their email; returns the photo paths.
  Both revoked from `public, anon`, granted to `authenticated`.

- [ ] **Step 1: Write the failing tests (block DR in `accounts.sql`)**
  - DR1: as a resident with 2 reports, a pin with a photo path, a vote and a check-in, `delete_my_data()` returns the one photo path; their reports have null `reporter_id`, `lat`, `lng`, `located` and keep `depth_level`, `zone_id`, `reported_at`; their pin has null `author_id` and `photo_path`; their vote and check-in are gone.
  - DR2: a pin of theirs that an official had removed is detached too, and stays removed.
  - DR3: with an active `auto_crowdsourced` advisory their report helped raise, after deleting, `private.report_evidence` counts one fewer reporter and the advisory row is unchanged.
  - DR4: another resident's rows are untouched; an official and the admin get `42501`; `anon` cannot execute it.
  - DR5: calling it twice returns an empty array the second time.
  - DR6: `my_report_positions()` returns the caller's own positions and no one else's.
- [ ] **Step 2: Run the block on live in a rolled-back `do` block** (helpers inside). Expected: DR1-DR6 fail (no functions).
- [ ] **Step 3: Write the migration.** If `pins_protect_moderation_columns` refuses the definer's update of `author_id` or `photo_path`, adjust that trigger so it only guards the moderation columns it names.
- [ ] **Step 4: Apply it** (name `residents_data_rights`), rename, re-run the block (all pass), `get_advisors` shows only the expected "signed-in users can execute" lines; update `database.types.ts` (the two functions; `reporter_id` and `author_id` become `string | null`), then `npm run typecheck` and fix each reader the change reaches.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_residents_data_rights.sql supabase/tests/accounts.sql src/lib/supabase/database.types.ts src
git commit -m "feat: a resident's data can be anonymised and deleted in one step, and their report positions read back"
```

### Task 2: Download my data

**Files:**
- Create: `src/app/api/my-data/route.ts` (+ `route.test.ts`)

**Interfaces:**
- Consumes: the resident's session (`createSupabaseUserClient`), `my_water_level_reports()`, Task 1's `my_report_positions()`, `my_recovery_questions()`.
- Produces: `GET /api/my-data` → `401` without a session; else `200`, `Content-Disposition: attachment; filename="weatherwell-my-data.json"`, `Cache-Control: no-store`, body:

```ts
interface MyData {
  exportedAt: string;
  account: { id: string; createdAt: string; anonymous: boolean; email: string | null };
  barangay: string | null; // profiles.zone_id
  reports: { id: string; zoneId: string; depthLevel: string; reportedAt: string; lat: number | null; lng: number | null }[];
  pins: { id: string; zoneId: string; statusTag: string; caption: string; lat: number; lng: number; createdAt: string; hadPhoto: boolean }[];
  votes: { pinId: string; direction: number; votedAt: string }[];
  checkIns: { zoneId: string; status: string; checkedInAt: string }[];
  alerts: { push: { zoneId: string; since: string }[]; email: { zoneId: string | null; since: string }[] };
  securityQuestions: string[];
}
```

- [ ] **Step 1: Write the failing tests**: `401` with no session; a full export assembles every section from the mocked client, with positions joined to reports by id; the push section carries no endpoint or keys; the security section carries questions only; an empty account returns every section present and empty.
- [ ] **Step 2: Run them.** `npx vitest run src/app/api/my-data` — Expected: FAIL.
- [ ] **Step 3: Implement**, filtering pins, votes and check-ins by the caller's id.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/app/api/my-data
git commit -m "feat: GET /api/my-data returns everything WeatherWell holds about the signed-in resident"
```

### Task 3: Delete my data

**Files:**
- Create: `src/app/actions/delete-my-data.ts` (+ `.test.ts`)
- Modify: `src/lib/outbox/outbox.ts` (`clearOutbox`)
- Create: `src/lib/forget-this-phone.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: Task 1's `delete_my_data()`; the service role (`SUPABASE_SERVICE_ROLE_KEY`, as `notify-officials.ts` builds it); `ONBOARDED_KEY` and the consent and selected-zone keys in `onboarding-storage.ts`; `idbGetAll`, `idbDelete`.
- Produces: `deleteMyData(): Promise<ActionResult>` (the RPC as the caller; then `storage.from("pin-photos").remove(paths)` when there are any, best effort; then `auth.admin.deleteUser(callerId)`; a refused RPC returns its message and deletes nothing else; a failed account delete returns `{ ok: false, permanent: false }` so a second try finishes it); `clearOutbox(): Promise<void>` (the local queue and its IndexedDB mirror); `forgetThisPhone(): Promise<void>` (`clearOutbox()` and the onboarding, consent and selected-zone keys).

- [ ] **Step 1: Write the failing tests**: no session → `{ ok: false, permanent: true }` and no service call; RPC refused → its message, no storage or account call; success with two paths → `remove(paths)` then `deleteUser(id)`, in that order; storage failing → `deleteUser` still called and `{ ok: true }`; `deleteUser` failing → `{ ok: false, permanent: false }`; a second run after success (RPC returns `[]`, `deleteUser` answers "User not found") → `{ ok: true }`; `forgetThisPhone` empties the queue, the mirror and the three keys.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again**, then `npm test`. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add src/app/actions/delete-my-data.ts src/app/actions/delete-my-data.test.ts src/lib/outbox/outbox.ts src/lib/forget-this-phone.ts src/lib/forget-this-phone.test.ts
git commit -m "feat: deleting my data removes the photos and the account after the database step, and the phone forgets its queue"
```

### Task 4: The card in Settings

**Files:**
- Create: `src/features/resident/your-data-card.tsx` (+ `.test.tsx`)
- Modify: `src/app/resident/settings/page.tsx`

**Interfaces:**
- Consumes: `GET /api/my-data`, `deleteMyData()`, `forgetThisPhone()`, the page's existing `isResident`.
- Produces: `YourDataCard(): JSX.Element`, rendered for residents only, below the security questions.

- [ ] **Step 1: Write the failing tests**, with this copy:
  - title "Your data" / "Ang iyong data"; "Download my data" / "I-download ang aking data" is a link to `/api/my-data` with `download`.
  - "Delete my data" / "Burahin ang aking data" opens a dialog listing, in both languages: "Your reports stay in your barangay's counts, without your account or location." / "Mananatili ang iyong mga ulat sa bilang ng barangay, nang wala ang iyong account o lokasyon."; "Your pins stay on the map without your account; their photos are deleted." / "Mananatili sa mapa ang iyong mga pin nang wala ang iyong account; buburahin ang mga larawan nito."; "Your votes, check-ins, alerts, security questions and account are deleted." / "Buburahin ang iyong mga boto, check-in, alerto, security questions at account."; "This phone is signed out and starts again." / "Mag-sa-sign out ang teleponong ito at magsisimula muli."
  - the confirm button is disabled until the box holds exactly `DELETE`; on success it calls `forgetThisPhone`, signs out and goes to `/onboarding`, after showing "Your data is deleted." / "Nabura na ang iyong data."; on failure it shows the action's message and stays.
  - the page shows the card for a resident and not for an official.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** with the app's `Card`, `Button` and dialog components.
- [ ] **Step 4: Run them again**, then `npm test`, `npm run lint`, `npm run typecheck`, `npm run knip`, `npm run build`. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add src/features/resident/your-data-card.tsx src/features/resident/your-data-card.test.tsx src/app/resident/settings/page.tsx
git commit -m "feat: Settings lets a resident download and delete their data"
```

### Task 5: Docs

**Files:** `PRD.md` (Data export and deletion row: Built; the privacy section names the rights), `handoff.md`.

- [ ] **Step 1: Update both.**
- [ ] **Step 2: Commit** — `git commit -m "docs: PRD and handoff for residents' data rights"`

## Rulings made while planning

- **One helper function, not two**: the spec named functions for report positions and pins' photo flags, but residents can already read their pins' `photo_path` through `pins_read`; only report positions are hidden from them (`hide_report_locations`). Cost if wrong: one more function later.
- **A failed account delete is retryable** (`permanent: false`): the database step is idempotent (a second call finds nothing), so a retry completes it. Cost if wrong: a resident retries once.
