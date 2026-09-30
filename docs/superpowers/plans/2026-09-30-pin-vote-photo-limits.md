# Limits for pins, votes and photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pin must be within 15 km of its barangay, and one account may place 5 pins and cast 30 votes an hour and upload 10 photos a day, with each refusal explained on the phone.

**Architecture:** Two triggers and a storage-policy change in one migration, enforced in the database like the report geofence (`20260922094703`). The hourly counts reuse `public.take_rate_limit` (`20260929144851_rate_limits`). The Server Actions map the refusals' hints to the existing `reason` values, so the outbox waits or stops exactly as it does for reports; the outbox badge and the pin form get the words.

**Tech Stack:** Postgres (Supabase), plpgsql triggers, Next.js 16 Server Actions, Vitest + Testing Library, `supabase/tests/abuse.sql` (run in CI).

**Spec:** `docs/superpowers/specs/2026-09-29-pin-vote-photo-limits-design.md`

## Global Constraints

- Numbers: a pin within **15 km** of its barangay's point; **5 pins an hour**, **30 votes an hour** (a vote and a change of mind count alike), **10 photo uploads a day**, per account.
- Officials (`private.is_operator()`) are not rate-limited on pins; the geofence applies to everyone.
- Refusals carry hints, as reports' do: `hint = 'too_far'` with `errcode = '23514'` (permanent), `hint = 'rate_limited'` (retried).
- Copy is bilingual (`LocalizedText`, English and Filipino) and never shows raw database text.
- The migration is applied to the live database with `apply_migration`, the file renamed to the version `list_migrations` reports, and checked once on live in a block that ends in an exception (nothing kept).
- The service worker `VERSION` goes up once per release, in the release commit, not in this plan.
- Commits are authored by the owner alone: no `Co-Authored-By` lines.

## Review Focus

1. A resident whose account already has 10 photos in the last day, but who cannot read `pin-photos` rows (only officials can): the count must still see them. Test: PH2 below counts through `private.photo_uploads_today`, not a policy subquery.
2. A refused vote must not take a pin down: the vote trigger runs `before`, the net-score removal `after`. Test: V2.
3. An official's pins over 5 an hour go through. Test: P3.
4. A pin replayed by the outbox under the same id (a `23505` the action treats as success) must not spend a second count: the trigger runs only on a real insert. Test: P4.
5. A rate-limited pin must stay queued and on the map, not be binned. Test: Task 2's `createPin` transient case.

---

### Task 1: The database limits

**Files:**
- Create: `supabase/migrations/<version>_pin_vote_photo_limits.sql` (version from `list_migrations` after applying)
- Modify: `supabase/tests/abuse.sql` (new blocks before the final `rollback;`)

**Interfaces:**
- Consumes: `public.take_rate_limit(p_key text, p_max int, p_window_seconds int) returns boolean` (service role only; callable from `security definer` functions), `private.is_operator() returns boolean`, the report trigger's distance formula (`20260922094703`, lines 49-59).
- Produces: `private.enforce_pin_geofence_and_rate_limit()` (trigger, `before insert on public.community_pins`), `private.enforce_vote_rate_limit()` (trigger, `before insert on public.pin_votes` only: `voteOnPin` always upserts, and an `insert … on conflict do update` fires the insert trigger once even when it becomes an update, so an update trigger as well would count a change of mind twice), `private.photo_uploads_today(p_uid uuid) returns int` (`security definer`, counts `storage.objects` in `pin-photos` with `owner_id = p_uid::text` and `created_at > now() - interval '1 day'`), and the replaced policy `pin_photos_insert_own` (its old check plus `private.photo_uploads_today((select auth.uid())) < 10`).

- [ ] **Step 1: Write the failing tests in `abuse.sql`**, in the file's style (`tests.as_user`, `tests.expect_denied`, `tests.expect_allowed`, and `do` blocks that raise `TSTFL`). Each refusal's hint is read with `get stacked diagnostics v_hint = pg_exception_hint`.
  - P1: a pin 16 km from its barangay's point is refused with hint `too_far` and SQLSTATE `23514`; one 14 km away is accepted.
  - P2: a resident's 6th pin in an hour is refused with hint `rate_limited`; the first 5 are accepted.
  - P3: an official (a profile with `role = 'operator'`) places 6 pins in an hour; all are accepted.
  - P4: inserting a pin whose id already exists raises `23505` and leaves the resident's count where it was (their next new pin is still accepted when they had 4).
  - V1: a resident's 31st vote upsert in an hour (new votes and changes of mind, each as `insert … on conflict (pin_id, voter_id) do update`) is refused with hint `rate_limited`; the first 30 are accepted, and a change of mind counts once, not twice.
  - V2: a 31st vote that would cross the net-score removal threshold is refused and the pin stays `removed = false`.
  - PH1: as a resident, inserting a 10th `storage.objects` row in `pin-photos` under their own folder is allowed, and an 11th is denied (`tests.expect_denied`).
  - PH2: `private.photo_uploads_today(uid)` returns 10 after PH1, although the resident's own `select` on those rows returns none.
  - L3: `anon` and `authenticated` cannot execute `private.photo_uploads_today`.

- [ ] **Step 2: Check the tests fail against the live schema.** CI runs `abuse.sql`; locally there is no Docker. Run the new blocks on the live database inside one `do` block that ends by raising an exception (nothing kept), with the helpers from `supabase/tests/helpers.sql` created inside it.
  Expected: P1, P2, V1, V2, PH1 fail (nothing refuses yet); P3, P4 pass trivially.

- [ ] **Step 3: Write the migration.** The pin trigger: skip nothing on the geofence; on the count, skip when `private.is_operator()` for the author, else `public.take_rate_limit('pin:' || new.author_id, 5, 3600)`. The vote trigger: `public.take_rate_limit('vote:' || new.voter_id, 30, 3600)`. Messages in the style of the report trigger ("This spot is more than 15 km from the barangay it is pinned in.", "Too many pins from this account this hour.", "Too many votes from this account this hour."). Revoke `private.photo_uploads_today` from `public, anon, authenticated`. `drop policy pin_photos_insert_own on storage.objects` and create it again with the added count.

- [ ] **Step 4: Apply it to the live database** with `apply_migration` (name `pin_vote_photo_limits`), rename the file to the reported version, and re-run the Step 2 block.
  Expected: every block passes, and the block's final exception is the only error. Then `get_advisors` (security) shows nothing new.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_pin_vote_photo_limits.sql supabase/tests/abuse.sql
git commit -m "feat: pins within 15 km of their barangay, and 5 pins, 30 votes and 10 photos per account per hour or day"
```

### Task 2: The actions report why

**Files:**
- Modify: `src/app/actions/pins.ts` (`classify`)
- Modify: `src/app/actions/vote-on-pin.ts` (`classify`)
- Test: `src/app/actions/pins.test.ts`, `src/app/actions/vote-on-pin.test.ts`

**Interfaces:**
- Consumes: the hints from Task 1.
- Produces: `createPin` returns `{ ok: false, permanent: true, reason: "too_far" }` for hint `too_far` and `{ ok: false, permanent: false, reason: "rate_limited" }` for hint `rate_limited`; `voteOnPin` returns the latter for its hint. `ActionResult`'s `reason` union already has both. The outbox route (`/api/outbox/[operation]`) already forwards `reason` (422 permanent, 503 retry).

- [ ] **Step 1: Write the failing tests**
  - `createPin` › "a pin too far from its barangay is refused for good, with the reason": the mocked insert returns `{ code: "23514", hint: "too_far" }`; expect `{ ok: false, permanent: true, reason: "too_far" }`.
  - `createPin` › "a rate-limited pin waits, with the reason": `{ code: "P0001", hint: "rate_limited" }`; expect `{ ok: false, permanent: false, reason: "rate_limited" }`.
  - `voteOnPin` › "a rate-limited vote waits, with the reason": same hint; expect `{ ok: false, permanent: false, reason: "rate_limited" }`.

- [ ] **Step 2: Run them.** `npx vitest run src/app/actions/pins.test.ts src/app/actions/vote-on-pin.test.ts`
  Expected: the three new tests FAIL (no `reason` in the result).

- [ ] **Step 3: Add the hint to each `classify`**, keeping today's permanence rules; `error` gains `hint?: string`.

- [ ] **Step 4: Run them again.** Expected: PASS, and the files' other tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/pins.ts src/app/actions/pins.test.ts src/app/actions/vote-on-pin.ts src/app/actions/vote-on-pin.test.ts
git commit -m "feat: a refused pin or vote says why, so the outbox waits or stops as it does for reports"
```

### Task 3: The words on the phone

**Files:**
- Modify: `src/features/outbox/outbox-copy.ts` (`entryStatusText`, `stuckReasonText`)
- Modify: `src/features/outbox/outbox-badge.tsx:193` (pass `zones`)
- Modify: `src/lib/pin-photo.ts` (`uploadPinPhoto`), `src/features/homepage-map/community-pin-form.tsx` (`send`)
- Test: `src/features/outbox/outbox-copy.test.ts`, `src/lib/pin-photo.test.ts`, `src/features/homepage-map/community-pin-form.test.tsx`

**Interfaces:**
- Consumes: the reasons from Task 2 as `entry.stuckReason === "too_far"` and `entry.waitReason === "rate_limited"`; Task 1's photo policy, whose refusal reaches `upload()` as a storage error with status 403.
- Produces: `entryStatusText(entry: OutboxEntry, lang: LanguageCode, zones: Zone[]): string`; `uploadPinPhoto(photo: Blob): Promise<PhotoUpload>` with `export type PhotoUpload = { path: string } | { failed: "limit" | "error" }`.

- [ ] **Step 1: Write the failing tests**, with this exact copy:
  - a waiting `createPin` with `waitReason: "rate_limited"` → en "Waiting: up to 5 pins an hour. It will send by itself." / fil "Naghihintay: hanggang 5 pin bawat oras. Kusa itong maipapadala."
  - a waiting `voteOnPin` with `waitReason: "rate_limited"` → en "Waiting: up to 30 votes an hour. It will send by itself." / fil "Naghihintay: hanggang 30 boto bawat oras. Kusa itong maipapadala."
  - a stuck `createPin` with `stuckReason: "too_far"` whose payload's zone is Poblacion → en "Couldn't send: This spot is too far from Poblacion to pin there." / fil "Hindi naipadala: Masyadong malayo ang lugar na ito sa Poblacion para mag-pin dito."
  - a waiting report keeps "Waiting: one report per barangay every 5 minutes…", and a stuck report's `too_far` keeps its 15 km sentence.
  - `uploadPinPhoto` resolves `{ failed: "limit" }` when storage answers with status 403, `{ failed: "error" }` on any other error or a stall, and `{ path }` on success.
  - the form, on `{ failed: "limit" }`: removes the photo, stays open, and shows en "You've added a lot of photos today — drop the pin again to send it without this one." / fil "Marami ka nang naidagdag na larawan ngayong araw — pindutin muli para ipadala ang pin nang wala nito."; on `{ failed: "error" }` it still shows `UPLOAD_FAILED`.

- [ ] **Step 2: Run them.** `npx vitest run src/features/outbox src/lib/pin-photo.test.ts src/features/homepage-map/community-pin-form.test.tsx`
  Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** `entryStatusText` picks the rate-limit sentence by `entry.operation`; `stuckReasonText` uses the pin sentence for a `createPin` and the zone's name from `zones` (the same lookup as `entryDescription`); `upload()` reads the storage error's status (`status === 403` or `statusCode === "403"`); `send()` maps the two failures to their copy.

- [ ] **Step 4: Run them again**, then the whole suite. `npm test`
  Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/outbox src/lib/pin-photo.ts src/lib/pin-photo.test.ts src/features/homepage-map/community-pin-form.tsx src/features/homepage-map/community-pin-form.test.tsx
git commit -m "feat: the phone says when a pin is too far, when pins or votes wait for the hour, and when photos hit the day's limit"
```

### Task 4: Docs

**Files:**
- Modify: `PRD.md` (the "Pin vote protection (layer 10)" row becomes Built; the pins row mentions the geofence and limits)
- Modify: `handoff.md` (what was built, the migration version, what was checked on live)

- [ ] **Step 1: Update both**, in the documents' own style.
- [ ] **Step 2: Commit**

```bash
git add PRD.md handoff.md
git commit -m "docs: PRD and handoff for the pin, vote and photo limits"
```

## Rulings made while planning

- **A rate-limited vote waits in the outbox and sends itself**, where the spec's copy said it "is not kept". Votes already go through the outbox, which treats a hinted rate limit as a wait (as for reports and pins); dropping it would need a new permanent classification for no gain. Cost if wrong: a vote lands up to an hour late.
- **A photo refused for the day's limit leaves the form open** to send the pin without it, like any failed upload, where the spec said the pin "will be sent without this one". The form cannot show a message after it closes. Cost if wrong: one extra tap.
- **The photo count runs in a `security definer` function**, not a policy subquery: residents cannot read `pin-photos` rows, so a subquery under their role would always count 0. The spec's intent (10 a day) is unchanged.
