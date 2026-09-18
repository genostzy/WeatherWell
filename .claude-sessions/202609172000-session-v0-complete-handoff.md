# Session Summary

**Date**: 17 September 2026, 20:00
**Project**: WeatherWell, a barangay flood-alert PWA for the whole Philippines
**Description**: V0 is finished, verified live and pushed. This is the handoff before V1.

---

## Current state at a glance

| Thing | State |
|---|---|
| `v0` on GitHub | `85c3560`. V0 is complete; the preview auto-deployed and is READY |
| Local `v0` | **one commit ahead**: `8440e58`, test password sign-in, **NOT pushed** (see below) |
| `main` on GitHub | `9f783d5`. Holds ONLY the Monitor workflow, `scripts/check-health.mjs` and a `vercel.json` that disables `main` deployments |
| `hi-fi` | Production. Untouched this session |
| Live Supabase (`keoxneujsebuedqbmqxz`) | Clean baseline: users 0, profiles 0, official_actions 0, alerts 0, reports 0, check-ins 0, pins 0, app_errors 0, zones 4, centres 4 (0 occupancy), municipalities 4, hazards 12, POIs 6 |
| Tests | 1126 passing locally (with `8440e58`), 1112 on `85c3560`. typecheck, lint, knip and build all green |
| V0 preview | https://weatherwell-git-v0-wilsondayritjrapex-5422s-projects.vercel.app |

## ⚠️ Decision pending: the unpushed commit `8440e58`

`8440e58 feat(auth): a preview-only password sign-in for owner-made test accounts` exists **only on this computer**.
- **What was asked:** Wilson asked for ready-made test accounts, approved design B (a preview-only password form), then said "don't [push], scratch that", and asked for this handoff.
- **What it does:**
  - adds a "Test sign-in (preview only)" form on `/sign-in` and `POST /auth/password`, which answers 404 on production;
  - adds `isTestSignInEnabled()`;
  - adds PRD notes on creating test users and deleting them before V1.
- **Security note:** preview and production share one Supabase project, so password test accounts can sign in through Supabase directly. Appointed test officials with weak passwords would be a real hole.

**Next session: ask Wilson whether to keep or drop it.** Nothing has been deleted. To drop it (it was never pushed):
```bash
git reset --hard 85c3560
```
The commit stays recoverable afterwards through `git reflog`.

The alternative for testing officials that needs no code is **Google accounts**:
1. Sign in at `/sign-in?next=/admin`.
2. Appoint in the Supabase SQL editor: `select private.appoint_official('email', 'Nilombot, Mapandan', 'Name');`
3. Remove with `select private.remove_official('email');`

## What we worked on (this long session, 11–17 Sep)

1. **Officials, areas and the action record** (plan `docs/superpowers/plans/2026-09-11-v0-officials-and-roles.md`).
   - Google sign-in, plus an email link that is **untested**.
   - PSGC-prefix area scoping enforced by RLS (`private.manages_zone`).
   - An append-only `official_actions` record.
   - `private.appoint_official` / `remove_official`, the `/admin` gate, dashboard scoping, and history.
   - Real PSA barangay codes, which Wilson looked up on psa.gov.ph:

     | Barangay | PSA code |
     |---|---|
     | Nilombot | 0105528012 |
     | Poblacion, Mangaldan | 0105526025 |
     | Poblacion, Manaoag | 0105525039 |
     | Poblacion Norte, Santa Barbara | 0105538021 |

   - Live-tested, including Wilson's own Google sign-in and appointment.
2. **Honest "Use my location"** (`src/lib/nearest-zone.ts`, `zone-picker.tsx`). It proposes the closest covered barangay within 5 km, says plainly when the person is outside coverage, and never auto-confirms.
3. **Monitoring with no new accounts** (spec `docs/superpowers/specs/2026-09-15-v0-monitoring-design.md`).
   - Crashes are scrubbed, then saved through `report_app_error` into `app_errors`.
   - `/api/health`.
   - The GitHub `Monitor` workflow runs every 15 minutes **from `main`**; its first manual run passed, and GitHub emails Wilson when it fails.
4. **Offline sending** (spec `docs/superpowers/specs/2026-09-16-v0-offline-sending-design.md`, plan `…/plans/2026-09-16-v0-offline-sending.md`).
   - A localStorage queue mirrored to IndexedDB.
   - The service worker drains via `POST /api/outbox/[operation]`, which checks ownership on the server.
   - Honest write times use the elapsed interval `sentAt − queuedAt` applied to the server clock. A report more than 6 hours old is refused, a check-in more than 3 days old is refused, and an older check-in never overwrites a newer one.
   - Retry and back-off rules exist in both `schedule.ts` and `sw.js`, held to `schedule-cases.json`.
   - A header waiting badge with Retry and Discard.
5. **Reviews and fixes.** Every task went through a review; the final whole-branch review (opus) ended with I-1…I-9 all fixed. Two data-loss races were caught and fixed: the page reconcile and the worker settle.

## Key outcomes

- **V0 "Done when" is met.** Offline sending was verified live on 17 Sep using a temporary test barangay, since deleted:
  - a normal send;
  - a report queued 45 min earlier arrived dated 45 min ago;
  - a 7-hour-old report was refused and shown as "couldn't send", then discarded with confirmation;
  - the worker sent a report queued 20 min earlier with its true time;
  - another person's entry was held, not sent and not shown.
- **Gap in the live test:** the test browser has Background Sync disabled, so the worker was woken by the page's drain message instead. **Sending with the app closed on a real Android phone has not been observed.**
- **Filipino copy:** all approved by Wilson. The new strings in `8440e58` are not reviewed yet (only relevant if kept).
- **The PRD is current:** Build Status, Setup (7 steps, with monitoring marked done) and Privacy.

## Files changed (highlights; see `git log eb6e028..HEAD`)

- `supabase/migrations/`, including:
  - `20260915094819_app_errors`
  - `20260915143824_honest_write_times`
  - `20260915150539_check_in_age_limit`
  - `20260917062646_app_error_count_environment`
  - the earlier officials migrations
- `supabase/tests/rls.sql`: the full database suite. Run `helpers.sql`, then `reference-tables.sql` + `rls.sql` as one call through Supabase MCP `execute_sql`; it must reach `rollback;`.
- `src/lib/outbox/*`, `public/sw.js`, `src/app/api/outbox/[operation]/route.ts`, `src/features/outbox/*`
- `src/lib/monitoring/*`, `src/instrumentation.ts`, `src/app/global-error.tsx`, `src/app/api/health/route.ts`, `scripts/check-health.mjs`, `.github/workflows/monitor.yml`
- `src/lib/auth/anonymous-session.ts`: `useSessionUserId` remembers the last user, so an hour offline no longer hides a resident's queued writes.
- `PRD.md`, plus the specs and plans above. Each plan has a "Found during execution" list.

## Next steps

- [ ] **Ask Wilson: keep or drop `8440e58`** (test password sign-in). Don't push it without his OK.
- [ ] Optional: Wilson checks closed-app sending on a real Android phone. Open the preview in Chrome, turn on airplane mode, file a report, close the app, turn airplane mode off, and confirm the row appears in Supabase.
- [ ] **Start V1, "geography and real data".** Begin with `superpowers:brainstorming`, and decompose into sub-projects first:
  - the nationwide barangay list with real boundaries (then change only `findNearestZone`);
  - real PAGASA and hazard data (start the PAGASA data request early);
  - offline map tiles;
  - self-hosted routing;
  - the threshold alert engine plus Web Push.
- [ ] V1 must also pick up the parked items (see "Found during execution" in `docs/superpowers/plans/2026-09-16-v0-offline-sending.md` and `…/2026-09-11-v0-officials-and-roles.md`):
  - late reports count toward flood consensus, because the count has no time window;
  - officials can forge an alert's previous level; make `set_zone_alert` the only writer;
  - orphaned community pins have no moderation path;
  - the crash log can be flooded to its 300/hour cap;
  - the unowned first write on a shared phone (accepted);
  - V1 hazard data will be mostly "unknown".
- [ ] Before any production launch:
  - switch `HEALTH_URL` in `main`'s `monitor.yml` to production;
  - set up SMTP and the email template (PRD Setup steps 4 and 6) so the email-link sign-in works, then test it live;
  - delete any test users;
  - get an RA 10173 legal review.

## Notes (how Wilson works; also in auto-memory)

- **Costs and setup:** free tiers only. No new third-party accounts and no pasted keys (he rejected Sentry and UptimeRobot as too much work). Give click-by-click steps with direct links when something needs him.
- **Ask first:** before every push (`v0`, `main`) and before live-database test writes. Live tests use a temporary zone, never zone-1..4, and the database must end at baseline. A real Warning once sat on Nilombot for about 15 minutes during a test.
- **Hard limits:** never create accounts or set passwords for him; never click CAPTCHAs (psa.gov.ph is behind Cloudflare, so Wilson looks codes up himself).
- **Next.js 16.3.4 differs from training data.** Read `node_modules/next/dist/docs/` before writing routes or pages.
- **Project rules:**
  - server trust uses `getClaims()`, never `getSession()`;
  - no secrets under `src/`;
  - never create a Supabase branch;
  - definer functions pin `search_path = ''`;
  - never revoke EXECUTE from `authenticated` on `private.is_operator` / `private.manages_zone`.
- **Process that worked:** SDD with per-task review, then a final review on opus. Reviewers caught real bugs, including two data-loss races and a shared-phone identity leak. Rate limits interrupted agents repeatedly, so always check `git status` and the live database after an interruption before resuming.
- **Session files are local:** `.claude-sessions/` and `supabase/.temp/` stay untracked, and nothing in `.superpowers/sdd/` is committed (the V0 workspaces were deleted after completion).

---

*Session ID: 202609172000-session-v0-complete-handoff*
