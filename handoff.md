# Handoff — 25 September 2026

## State

- Branch `mvp`, cut from `v1` at `912a5cb`, is pushed to GitHub. CI is green on `a8c6cb4` ([run #106](https://github.com/genostzy/WeatherWell/actions/runs/36133180076)): both the `check` job (lint, typecheck, tests, knip, build) and the `database` job (rls, abuse, accounts) pass.
- `v1` (production) and `main` are unchanged. Nothing was changed in the live Supabase project, Vercel or Google.

| Commit | What |
|---|---|
| `5b08eda` | Consent notice split into "You choose" and "Always on" (review findings 1, 5, 6, 14, 15) |
| `9ef012b` | DB: layer 6 reputation, identity age, rate-limit and outlier fixes; `supabase/tests/abuse.sql` |
| `4d8289f` | Reject records a rejection; the app's own count mirrors the engine |
| `a850407` | Stage 4 plan, README |
| `faeb553` | DB: security questions, admin password reset, email-alert opt-ins; `supabase/tests/accounts.sql` |
| `073e22a` | Sign-up without confirmation, `/forgot-password`, Settings cards, email alerts, push on official alert changes |
| `eaa7869` | `scripts/reset-test-accounts.ts`; PRD Setup steps 8 and 9 |
| `a8c6cb4` | This handoff |

## Owner's decisions (25 September)

- Consent: reword into groups rather than add opt-out switches. Crash reports are "Always on".
- Stage 4 starts with the anti-abuse suite.
- Layer 6: a device whose advisories were rejected more often than confirmed weighs 0 until a confirmed one evens it out.
- Device-fingerprint hardening is done through identity age, collecting nothing new. An identity under a day old earns no bonuses and cannot set the outlier consensus, and every advisory needs one reporter over a day old.
- Email confirmation is off for password sign-up. This reverses the PRD's old "never turn on autoconfirm"; the PRD Setup section now records the decision.
- Email alerts go out from a Gmail app password, are opt-in, and only reach Google accounts.
- Forgotten passwords are reset with security questions for residents only; officials get a new password from an admin.
- The 4 old test accounts are deleted. The new ones are `adminTEST@`, `Brgy.NilombotTEST@`, `userTEST@` and `Mun.MapandanTEST@weatherwell.com`, with passwords from `.env.local` only.

## Owner steps, in order

1. Apply the migrations to the live database in this order, with the Supabase MCP `apply_migration`. Then rename each file to its live version (the M2 rule). Both only add things. Until they are applied, the `mvp` preview cannot load reports or use the new features.
   - `supabase/migrations/20260925100000_reputation_and_identity_age.sql`
   - `supabase/migrations/20260925120000_password_recovery_and_email_alerts.sql`
2. In Supabase, go to Authentication → Sign In / Providers → Email and turn off "Confirm email".
3. Create a Gmail account and an app password. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in Vercel for Production and Preview (PRD Setup step 8).
4. Put the four `TEST_*_PASSWORD` variables in `.env.local` and run `npx tsx scripts/reset-test-accounts.ts` to see the plan. Run it again with `--yes` to do it (PRD Setup step 9).
5. After testing, change the test passwords. They were shared in chat and are easy to guess, and the admin account controls the live system.
6. Merge `mvp` into `v1` once steps 1–5 are done and CI is still green.

## Risks to keep in mind

- **Impersonation:** with confirmation off, anyone can register any email. Confirm an official's email by phone or in person before appointing them, and prefer their Google account.
- **Security questions:** someone who knows the resident can guess the answers. They are limited to 5 tries an hour per email, but there is no per-IP limit, so a flood of recovery attempts costs database CPU (bcrypt).
- **Email volume:** a free Gmail account sends about 500 emails a day. A town-wide alert with many subscribers can reach that.
- **More pushes:** residents now get a push for every change of severity an official makes, and for lifts and rejections. Before, they only got automatic advisories.
- **Offline reports:** an offline phone's second report for the same barangay now waits for the outbox retry, because the rate limit reads `received_at`.
- **Abuse the database cannot stop** (listed in the `abuse.sql` header):
  - GPS spoofed to a point inside the barangay.
  - Identities made a day ahead.
  - Several established identities agreeing on "dry".
  - New anonymous identities, limited only by Supabase's per-IP rate limit.

## Open work

- Stage 4 plan (`docs/superpowers/plans/2026-09-25-mvp-final-testing.md`):
  - Refresh the PRD Build Status table, which is stale since 15 September.
  - Calibration loop.
  - WCAG 2.1 AA audit.
  - TTS.
  - Pilot drill (the owner's task).
- Privacy findings still open from the consent review (queued as a separate task):
  - `/report` asks for location before consent.
  - An alert address is left behind after the account changes.
  - The anonymous account is not disclosed.
  - A crash report's route can carry a barangay code.
  - Reports without a location are told they count.
  - Consent is not versioned.
  - The GPS position is sent in a GET query string.

## Checks

- App: `npm run lint`, `npm run typecheck`, `npm test`, `npm run knip`, `npm run build`.
- Database: start Supabase the way CI does, then run `helpers.sql`, `reference-tables.sql`, `rls.sql`, `abuse.sql` and `accounts.sql` with `psql` (see `.github/workflows/ci.yml`). In the cloud sandbox Docker Hub was rate-limited; pulling the images from `mirror.gcr.io` and retagging them worked.
- Last run, 25 September, both locally and in CI run #106:
  - 1,596 app tests pass.
  - Database checks: rls 207, abuse 13, accounts 8, all passing.
  - Lint, typecheck, knip and build are clean.

## Where things live

- Anti-abuse: the `20260925100000` migration, and `supabase/tests/abuse.sql`.
- Recovery: the `20260925120000` migration, `src/app/actions/recovery.ts`, `src/features/auth/forgot-password-panel.tsx`, `src/features/resident/security-questions-card.tsx`, and the admin reset in `src/features/admin/officials-panel.tsx`.
- Email: `src/lib/send-email.ts`, `src/lib/email-alerts.ts`, `src/lib/notify-residents.ts`, `src/app/api/email/unsubscribe/route.ts`, `src/app/unsubscribe/page.tsx` and `src/features/resident/email-alerts-card.tsx`.
- Consent notice: `CONSENT_ITEMS` in `src/features/onboarding/consent-notice.tsx`.
