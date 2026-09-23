# Stop the Bleeding — Security and Alert Integrity (Sub-project 1 of 6)

**Date:** 2026-09-23
**Status:** Approved in conversation, pending written-spec review
**Branch:** `v1` (12 commits ahead of `origin/v1`, none pushed)

## Why this exists

A full review on 2026-09-23 found that WeatherWell's safety information can be forged, its officials can be overridden by a script, and residents' report locations are public. This sub-project closes every hole that is exploitable today, before anything on `v1` is pushed to the public GitHub repo.

## Roadmap this spec belongs to

The review's fixes and ideas are split into six sub-projects, built in this order. Each gets its own spec, plan and execution.

| # | Sub-project | Covers (review IDs) |
|---|---|---|
| **1** | **Stop the bleeding (this spec)** | C1, C2, C3, H3, H4, M3, L3 |
| 2 | Safety net — real-database and scale tests in CI | Idea 14, M2 |
| 3 | Honest data | C4, C5, H5, H6, M4, M5, ideas 1, 11, 16 |
| 4 | Performance and scale | H1, H7, M1 |
| 5 | Alert pipeline redesign | H2, ideas 3, 4, 5, 13 |
| 6 | Reach and resident UX, then hygiene | M6, ideas 6, 7, 8, 9, 10, 12; L1, L2, idea 15, earlier deferred minors |

L4 (Vercel Hobby is non-commercial) has no zero-cost fix and stays a written note. "Cut" items from the review are hidden from residents, never deleted.

## Constraints

- **Zero cost, no new accounts.** Only the owner's existing Supabase, Vercel and GitHub.
- The database is the production Supabase project; there is no staging. Every migration is real.
- Nothing is pushed without the owner's approval.
- Live test writes go only to a temporary zone that is deleted afterwards.
- Enforcement lives in the database (RLS, grants, triggers, function bodies), never only in Next.js code — anyone can call the database directly with the public key.

## Decisions

| Question | Decision | Why |
|---|---|---|
| How to remove the committed test passwords | Rotate all three passwords, then rewrite only the unpushed commits so the old password text never reaches GitHub | Rotation makes any copy worthless; rewriting keeps the public history clean. Unpushed commits can be rewritten without affecting anyone else. |
| Where new passwords live | `.env.local` (git-ignored), filled in by the owner | No password in the repo, docs, or chat |
| Maximum severity of an automatic (crowd-report) alert | Yellow (Advisory), labelled unverified | Location can be faked with effort; capping severity bounds the worst a spoofer can do. Officials escalate real floods. Sub-project 5 replaces this with official approval. |
| Which reports count toward an automatic alert | Only reports carrying a location that passed the geofence | A report without location is still accepted and shown (outage-friendly), it just cannot trigger an alert |
| Automatic alerts vs officials | The engine never touches a barangay whose active alert an official set, never downgrades, and ignores reports filed before the official's last decision | The PRD calls human override "the spine of the whole design" |
| Captcha on anonymous sign-in | Not used | Needs a new third-party account. Supabase's free anonymous sign-in rate limit is used instead (manual Dashboard step, optional). |
| Pins' `author_id` and votes' `voter_id` | Left public (out of scope) | Documented, accepted design; public posts under a pseudonymous id are far lower risk than GPS coordinates |

## Design

### 1. Credentials (C1)

- `scripts/create-test-accounts.ts` becomes `scripts/rotate-test-account-passwords.ts`. It reads `TEST_ADMIN_PASSWORD`, `TEST_OFFICIAL_PASSWORD` and `TEST_USER_PASSWORD` from the environment, refuses to run if any is missing or shorter than 12 characters, and calls `auth.admin.updateUserById` for each of the three existing accounts (looked up by email). It never prints a password.
- The spec and plan documents from 2026-09-22 that quote the old passwords are edited to say `<redacted>`.
- A non-interactive history rewrite over `origin/v1..v1` only replaces the three old password strings with `<redacted>` in every file of every rewritten commit. Before it runs, a backup branch `backup/pre-scrub-<date>` is created. After it runs, `git log -p origin/v1..v1` is searched for all three old strings and must return nothing. The backup branch is deleted only after the owner confirms.
- The rewrite happens before the first push of this work.

### 2. Automatic alert engine (C2, C3)

`public.check_and_trigger_alerts()` is rewritten. For each barangay with recent reports it:

1. Skips the barangay if its active alert has `source = 'manual'`.
2. Finds the time of the last human decision for that barangay: the latest `occurred_at` in `official_actions` where `zone_id` matches, `action in ('alert.set', 'alert.cleared')`, and `actor_name not like 'Automatic%'` (the engine's own entries are recorded as "Automatic — auto_crowdsourced" by `private.record_alert_set`; everything else — an official, or the owner in the SQL editor — is a human decision). Only reports after that time count; no decision means all reports in the window count. The alert rows themselves cannot answer this: when an official clears an automatic alert, the superseded row still says `source = 'auto_crowdsourced'`.
3. Counts distinct reporters within the existing 6-hour window, considering only reports that are not outliers **and** have non-null `lat`/`lng` (which already passed the geofence trigger on insert).
4. Requires at least 3 distinct reporters and the existing ankle-or-deeper depth threshold.
5. Issues severity **yellow** only, with message `Advisory — N residents report <depth> water (unverified).` in English and Filipino, where `<depth>` is the most common reported depth.
6. Does nothing if the barangay's active alert is already an automatic yellow (no re-issue, so no repeated push).

The function pins `search_path = ''`.

### 3. Database permissions (H3)

- `public.get_push_subscriptions_for_zone` is dropped. Nothing calls it; the push sender reads the table directly with the service-role key.
- `public.check_and_trigger_alerts` and `public.cleanup_old_weather_readings`: `EXECUTE` revoked from `public`, `anon`, `authenticated`; granted to `service_role` only. Both pin `search_path = ''`.
- Every remaining `SECURITY DEFINER` function in `public` flagged by the advisor for a mutable search path is given `search_path = ''`.

### 4. Report privacy (widened M3)

- Column-level `SELECT` on `water_level_reports.lat`, `.lng` and `.reporter_id` is revoked from `anon` and `authenticated`. Other columns stay readable.
- New `public.my_water_level_reports()`: `SECURITY DEFINER`, `search_path = ''`, returns `id, zone_id, depth_level, reported_at` for rows where `reporter_id = auth.uid()`. `EXECUTE` granted to `authenticated` only.
- `src/app/resident/page.tsx` and `src/app/resident/reports/page.tsx` switch from `.from("water_level_reports").eq("reporter_id", ...)` to `.rpc("my_water_level_reports")`.
- `/api/reports` stops selecting and returning `reporter_id`; `LiveWaterLevelReport` loses `reporterId` (no consumer reads it).

### 5. Push targeting (H4)

- `src/lib/send-zone-push.ts` selects subscriptions with `zone_id = <zone>` only.
- `usePushSubscription` does nothing when no zone is selected.
- `push_subscriptions.zone_id` becomes `NOT NULL` (there are 0 rows today).

### 6. Error-log spam (L3)

`public.report_app_error` skips the insert when the same `fingerprint` was recorded in the last 60 seconds, and when 200 rows already exist from the last hour. It stays callable by `anon` (the app reports its own crashes before any sign-in).

### 7. UI

The alert card shows a short note when the alert's `source` is `auto_crowdsourced`: "Unverified — based on residents' reports, not yet confirmed by an official" / Filipino equivalent, as a `LocalizedText`.

## Corrections found while planning

Reading the code for the plan changed seven details above. These supersede the sections they name.

1. **Section 2 simplifies.** Yellow is the lowest severity, so any active alert is equal or higher. "Skip the barangay if it has any active alert" covers both "never touch an official's alert" and "never re-issue or downgrade". Reports must also be strictly *after* the last human decision (`>`), and only non-`dry` reports count. Today three "dry" reports trigger an alert.
2. **Section 3 adds one drop.** `public.get_reference_data_compact()` is also unused, and callable by anyone. Each call returns the entire nationwide dataset, which lets anyone burn database CPU. It is dropped alongside `get_push_subscriptions_for_zone`.
3. **Section 4, mechanism.** Postgres ignores a column-level `REVOKE` while a table-level `SELECT` grant exists. The migration revokes table-level `SELECT` from `anon`/`authenticated`, then grants back `id, zone_id, depth_level, reported_at, trust_weight, is_outlier`. The resident overview's report count also switches to `my_water_level_reports()`, because its `select("*")` would otherwise fail.
4. **Section 5 adds the reason there are 0 subscriptions.** `usePushSubscription` saves the subscription only if a session already exists. A resident who has never filed a report has no session, so their subscription is silently dropped. It now calls `ensureAnonymousSession()` before saving. The `zone_id` foreign key changes from `on delete set null` to `on delete cascade`, which `NOT NULL` requires.
5. **Section 6 was mostly done already.** `report_app_error` already de-duplicates for 5 minutes and caps at 300 per hour. The real gap is storage. 300 per hour × 30-day retention allows about 216,000 rows (about 1 GB), twice the free-tier database. The fix: also skip the insert once the table holds 5,000 rows.
6. **Push text.** `/api/threshold-check` sends "Crowd reports indicate yellow level flooding". It changes to an unverified-advisory wording that matches the alert.
7. **Last session's `rls.sql` blocks are broken, and are fixed here.**
   - `tests.as_user()` only records an impersonation for `expect_allowed`/`expect_denied`; it does not switch the role. The two profile-visibility blocks run as `postgres`, so the admin check proves nothing, and the non-admin check fails the whole suite.
   - The two admin-demotion blocks count *any* error as a pass.
   - All four switch roles explicitly (`set local role authenticated` plus JWT claims) and match the exact error message.

## Testing

- **`supabase/tests/rls.sql`**, new blocks proving:
  - reports without location do not trigger an alert;
  - an official's active alert is never replaced or downgraded by the engine;
  - an official's clear is not re-triggered by reports filed before it;
  - an automatic alert is always yellow and never re-issued at the same severity;
  - `anon` cannot execute the engine or the cleanup function, and cannot select `lat`, `lng` or `reporter_id`;
  - a resident sees exactly their own rows via `my_water_level_reports()`;
  - `report_app_error` de-duplicates and caps.
- **Unit tests (TDD)** for every changed TypeScript file.
- **Live verification** against production, re-running each attack from the review: anonymous engine call, location-less spoof reports, overriding an official's alert, reading report GPS with the public key. Every attack must fail. Test writes use a temporary zone deleted afterwards.
- Full gate: `vitest`, `typecheck`, `lint`, `knip`, `build`.

## Manual steps for the owner

1. Put three new passwords (12+ characters) in `.env.local` as `TEST_ADMIN_PASSWORD`, `TEST_OFFICIAL_PASSWORD`, `TEST_USER_PASSWORD`.
2. Optional: Supabase Dashboard → Authentication → Rate Limits → lower anonymous sign-ins per IP from 30 to about 10 per hour.

## Out of scope

- Trust weights, official approval of automatic alerts, instant (non-scheduled) threshold evaluation — sub-project 5.
- A subscription following the resident when they change barangay — sub-project 5.
- Public `author_id` on pins and `voter_id` on votes.
