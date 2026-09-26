# Handoff — 26 September 2026

## State

- `mvp` was merged into `v1` on 25 September. `v1` is the default branch and the production branch; `mvp` stays at `0b9f0fd` for reference.
- **Production runs `8fa9dd9`**, released on 25 September with the privacy fixes.
- **`v1` is 6 commits ahead of `origin/v1`, not pushed and not released:**

| Commit | What |
|---|---|
| `43d3145` | Read-aloud on the evacuation instructions, and English with a note when the phone has no Filipino voice (Task 5) |
| `bdf075b` | DB: the calibration loop and confidence tags; `supabase/tests/calibration.sql` (Task 3) |
| `1045501` | App: confidence tags on alerts, each barangay's own bar in the report counts, the Calibration panel for officials (Task 3) |
| `1e63060` | The WCAG 2.1 AA audit's fixes (Task 4) |
| `e2cc8a9` | `/admin/history` describes a calibration move and an admin's password reset in words |
| The latest | Docs: PRD Build Status and Setup step 10, the Stage 4 plan, README and this handoff (Task 2) |

- The calibration migration `20260926010743_calibration_loop` is **already live**. It only adds, so production at `8fa9dd9` runs with it: advisories now get a confidence tag and outcomes are recorded, but production shows neither until the commits above are released.
- `pg_cron` holds two jobs that start the GitHub workflows on time. They do nothing until the owner adds the token (step 1 below); GitHub's own, late schedule still runs meanwhile.

## Stage 4 exit criteria

| Criterion | State |
|---|---|
| Anti-abuse layers 1–6 live, abuse-attempt suite passes | Met. `abuse.sql` runs in CI |
| Calibration loop run against a real event | Built and recording. Needs a real flood; so far only labelled test advisories exist |
| WCAG 2.1 AA audit, no outstanding violations | Met on 26 September, after `1e63060` |
| Pilot drill, feedback incorporated or deferred | The owner's. Drill mode is at `/admin/simulation` |

## Owner steps, in order

1. **Scheduled jobs on time.** Make a fine-grained GitHub token for the `WeatherWell` repository with only "Actions: Read and write", and store it in Supabase Vault as `github_workflow_token` (PRD Setup step 10).
2. **Release.** Say "push and release" and the commits above go out: push `v1`, wait for the Vercel preview and CI, then redeploy that build to production.
3. **Clean up test data.** Lift the Nilombot test alert (yellow, set by Test Official at 22:17), and remove the leftover `mapandanofficial@weatherwell.com` account.
4. **Change the test passwords** in `.env.local` and rerun `npx tsx scripts/reset-test-accounts.ts --yes`. They were shared in chat and the admin account controls the live system.
5. **Pilot drill** with a barangay, then log its feedback as incorporated or deferred.

## Owner's decisions (26 September)

- Calibration: "Auto, floor stays". The loop moves each barangay's bar by itself, logs every move to the action record, and never goes below 3 reporters and trust 1.0.

## Open work

- The calibration loop's first real event: record the outcome in the Stage 4 plan when one happens.
- Not started, listed in the PRD Build Status:
  - Real hazard data: every barangay's hazard is "Unknown".
  - The prediction engine, so `predicted_timing` stays empty and the loop compares outcomes, not timings.
  - The cascade heads-up downstream.
  - Self-hosted routing: directions use the public OSRM server's car profile.
  - Geofence and rate limit for pins and votes.
  - Data export and deletion (RA 10173 Article 16).
  - Clean-up of unused anonymous identities.

## Risks to keep in mind

- **Impersonation:** with email confirmation off, anyone can register any email. Confirm an official's email by phone or in person before appointing them, and prefer their Google account.
- **Security questions:** someone who knows the resident can guess the answers. The limit is 5 tries an hour per email, with no per-IP limit.
- **Email volume:** a free Gmail account sends about 500 emails a day.
- **The bar only rises with officials' verdicts.** An official who rejects correct advisories raises their barangay's bar; the dashboard's Calibration panel shows every move.
- **Abuse the database cannot stop** (the `abuse.sql` header): GPS spoofed to a point inside the barangay, identities made a day ahead, several established identities agreeing on "dry", and new anonymous identities, limited only by Supabase's per-IP rate limit.

## Checks

- App: `npm run lint`, `npm run typecheck`, `npm test`, `npm run knip`, `npm run build`.
- Database: start Supabase the way CI does, then run `helpers.sql`, `reference-tables.sql`, `rls.sql`, `abuse.sql`, `accounts.sql` and `calibration.sql` with `psql` (see `.github/workflows/ci.yml`).
- Last run, 26 September, locally: 1,667 app tests pass; lint (two old warnings in a test), typecheck, knip and build are clean. The calibration checks C1–C8 passed against the live database inside a rolled-back transaction.

## Where things live

- Calibration: the `20260926010743` migration, `supabase/tests/calibration.sql`, `src/features/admin/calibration-panel.tsx`, `src/features/alerts/confidence-tag.tsx`, `src/app/api/alert-bars/route.ts` and `alertBar` in `src/lib/weather-thresholds.ts`.
- Read-aloud: `src/features/alerts/read-aloud-button.tsx`.
- Accessibility: `src/features/map/map-centre-placer.tsx`, and the tests `src/app/colour-contrast.test.ts` and `src/app/page-titles.test.ts`.
- Scheduling: the `20260925135257` migration.
- Anti-abuse: the `20260925123429` migration and `supabase/tests/abuse.sql`.
- Consent notice: `CONSENT_ITEMS` in `src/features/onboarding/consent-notice.tsx`, versioned by `CONSENT_VERSION` in `onboarding-storage.ts`.
