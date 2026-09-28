# Handoff — 28 September 2026

## State

- `mvp` was merged into `v1` on 25 September. `v1` is the default branch and the production branch; `mvp` stays at `0b9f0fd` for reference.
- **Production runs `4f592b6`** (officials fill in their barangay's details, below, released on 28 September). Before it ran `dea649b` (changing and viewing a barangay, below), and before that `d4ac54a` (the review fixes below), released later on 26 September. Before that, `ddf7293` was released as `dpl_DAEpr9WuSe9jkLvzPLWoHsPcQf8B` after CI run #115 passed, shipping these commits on top of `8fa9dd9`:

| Commit | What |
|---|---|
| `43d3145` | Read-aloud on the evacuation instructions, and English with a note when the phone has no Filipino voice (Task 5) |
| `bdf075b` | DB: the calibration loop and confidence tags; `supabase/tests/calibration.sql` (Task 3) |
| `1045501` | App: confidence tags on alerts, each barangay's own bar in the report counts, the Calibration panel for officials (Task 3) |
| `1e63060` | The WCAG 2.1 AA audit's fixes (Task 4) |
| `e2cc8a9` | `/admin/history` describes a calibration move and an admin's password reset in words |
| `ddf7293` | Docs: PRD Build Status and Setup step 10, the Stage 4 plan, README and this handoff (Task 2) |

- The calibration migration `20260926010743_calibration_loop` went live before the release; it only adds, so the earlier build ran safely with it.
- Checked on production after the release: the 8 public pages tried each have their own title, `/api/health` reports the database ok with no recent errors, and `/api/alert-bars` answers (no barangay's bar has moved yet).
- `pg_cron` now starts the GitHub workflows on time. The owner put the token in Vault at 02:18 UTC on 26 September, and the first dispatched Monitor run started at 02:30 UTC and passed.
- The Nilombot test alert (yellow, set by Test Official at 22:17 on 25 September) was lifted at 02:21 UTC on 26 September. The action record shows it as cleared by the System owner. No push or email went out, because it was lifted in the database, not through the app.

### Officials fill in their barangay's details, 28 September

Officials enter what residents had only as placeholders: up to 3 hotline numbers, the evacuation instructions (English, Filipino or both; a blank language shows the other, marked with its real language) and the centre, picked from OpenStreetMap or placed on a map. Designed in `docs/superpowers/specs/2026-09-28-barangay-details-design.md`, planned in `docs/superpowers/plans/2026-09-28-barangay-details.md`, reviewed by a fresh reviewer (Opus; Fable had no usage credits), and **released on 28 September as `dpl_BgPg4GTEKAzDYJiT6oMxfi3SzGru` (`4f592b6`)** after CI run #120 passed, database suites included.

| Commit | What |
|---|---|
| `c521f22` | No grey hazard ring around every barangay while hazard data is unknown |
| `9f75477` | DB: `set_barangay_details` (area-checked, recorded as `barangay.details`), `zones.extra_hotlines` and `details_set_at` |
| `ed6d71a` | The rules and wording for numbers and instructions, in both languages |
| `c53248e` | `/api/barangay-details`, laid over the offline file and kept by the service worker (v21) |
| `d287ffb` | A call button for each number; every call link dials digits only |
| `21f0a5e` | Edit barangay details on the barangay page |
| `d238197` | Place the centre on a map |
| `6c2a971` | Operations map and Drill in the barangay officials' menu; Drill in the town's |
| `df9f0e6` | Docs: PRD and README |
| `66c9141` | The review's fixes: a centre confirmed without a capacity reaches phones (`evacuation_centers.confirmed_at`); "(+63)" numbers dial right; whitespace-only boxes are blank; the official's next open shows the new details; the plan shows the instructions without a centre; the placeholder is not offered as the official's words; errors name their field; instructions in one language are marked with it |
| `4f592b6` | The new database checks use fixture ids no other block uses (CI run #119 failed on the clash) |

- Two migrations came with it, applied live before the release: `20260928083830_barangay_details` and `20260928123726_barangay_details_fixes`. Both only add, or replace a function with the same signature and grants.
- Checked on production after the release: service worker v21 lists `/api/barangay-details`; the feed answers (empty until an official saves); `/api/centres` lists the one confirmed centre; the pages answer; the new wording is in the served code; and `/api/health` reports the database ok with no recent errors.
- Not fixed, minor: pasted numbers with non-breaking spaces, en dashes or dots are refused; "Saved — residents see it the next time their app opens" is one open early; on a very slow first load the feed can overwrite a just-saved change on the official's screen; odd capacities show an untranslated message; focus and screen-reader details in the new forms; the centre panel's loading state; two test gaps; one PRD line reads as if the details function also saves the centre.

### Changing and viewing a barangay, 28 September

Residents can change their barangay after setup, look at another barangay without changing theirs, and report where GPS puts them. Designed in `docs/superpowers/specs/2026-09-26-change-and-view-barangay-design.md`, planned in `docs/superpowers/plans/2026-09-26-change-and-view-barangay.md`, reviewed by a fresh reviewer at the end, and **released on 28 September as `dpl_hyBRodJ4LUgpJcbkoJUUWU4RhrWo` (`dea649b`)** after CI run #117 passed. No migrations.

| Commit | What |
|---|---|
| `892bc66` | My barangay can change while the app is open; every screen follows it |
| `1ce023a` | "Change" on the home screen and on your own card in the Zones list; email alerts follow the change |
| `c206d0c` | View another barangay (`/?zone=`), with Back to my barangay and My location; push stays on mine |
| `5bdae0d` | A report counts where GPS puts you, or for your barangay without a position; the danger banner speaks Filipino |
| `c682ece` | The Zones list's View and Evacuation open the barangay on the card |
| `1ff8eb7` | A viewed barangay opens offline from the cached page (service worker v20) |
| `dea649b` | The review's fixes: within 2 km of your barangay's centre a report stays yours; the screen starts afresh on a change; push follows a change made anywhere; `/evacuation?zone=` says whose it is |

- **The home radius is 2 km** (`HOME_RADIUS_METERS` in `src/lib/where-you-are.ts`), kept by the owner on 28 September. Larger keeps more reports at home, including some made just across the border; smaller hands at-home reports to a neighbour in dense towns.
- Not fixed, minor: the picker hides "Use my location" before consent instead of pointing to the notice; Change is offered offline, where the search cannot work; "Palitan" and "Baguhin" name the same step; the push line shows even when push is off; clearing storage in another tab goes unnoticed; while viewing, My location does not name where you are.
- Checked on production after the release: service worker v20 is served with the offline rule for pages with a query; `/`, `/evacuation`, `/report` and `/map` answer, with and without `?zone=`; the new wording is in the served code; and `/api/health` reports the database ok with no recent errors.

### Code review of the session, 26 September

A self-review of `0b9f0fd..ddf7293` (the review agents hit their usage limit) found 15 issues. Fixed in these commits, **released on 26 September as `dpl_5a8ZnfuYFip7K2uqAEFLvPqCGGWL` (`d4ac54a`)** after CI run #116 passed, database suites included:

| Commit | Fix |
|---|---|
| `8c84424` | A report sent without a location no longer counts toward "enough neighbours" or "Threshold met" (the engine never counts it) |
| `a9f0411` | DB: a missed event is only what the raised bar kept quiet; one rule for the reports that count, `private.report_evidence` |
| `f3eb5ea` | `/onboarding` is precached (service worker v19), so a new consent version never strands a resident offline |
| `6e8fc9d` | "How high am I?" waits for the consent notice |
| `145bbbd` | A town's calibration record is filtered in the query, before the 30-row limit |
| `801de6a` | A queued report's rate-limit note never outlives the wait |
| `251f5fe` | `/api/alert-bars` reads past PostgREST's 1,000-row page |
| `0888fb2` | The bar is described one way on the dashboard and in the action record |
| `065d91b` | Monitor fails, and so emails the owner, once Supabase has not started a run for an hour (an expired Vault token) |
| `39bddbb` | DB: a report's refusal carries a HINT (`too_far`, `rate_limited`) that the app matches, not the wording |

- Three migrations came with them, applied live before the release: `20260926062134_report_located_flag`, `20260926062859_missed_needs_floor_evidence` and `20260926064539_report_refusals_carry_hints`.
- Checked on production after the release: service worker v19 precaches `/onboarding`, `/api/reports` carries `located`, `/api/alert-bars` answers, and `/api/health` reports the database ok with no recent errors.
- Left for the owner to decide:
  - **Undo is still 3 seconds.** WCAG 2.2.1 prefers 20 seconds or a way to extend it, but a longer undo holds every report back that much longer before it is sent.
  - **Page titles stay in English** when the app is in Filipino. Localizing them needs the language to reach the server (a cookie), because Next.js metadata is rendered there.
- Not fixed, minor: each component that shows a bar fetches `/api/alert-bars` itself (the CDN caches it for 60 seconds).
- The live database has a leftover `tests` schema from an earlier test run (helper functions only; no client can reach it). It can be removed with `drop schema tests cascade;`.

## Stage 4 exit criteria

| Criterion | State |
|---|---|
| Anti-abuse layers 1–6 live, abuse-attempt suite passes | Met. `abuse.sql` runs in CI |
| Calibration loop run against a real event | Built and recording. Needs a real flood; so far only labelled test advisories exist |
| WCAG 2.1 AA audit, no outstanding violations | Met on 26 September, after `1e63060` |
| Pilot drill, feedback incorporated or deferred | The owner's. Drill mode is at `/admin/simulation` |

## Owner steps, in order

1. **Remove the leftover `mapandanofficial@weatherwell.com` account.** It is still appointed as a municipal official for Mapandan. Remove it at `/admin/officials` while signed in as the admin, so the record names who removed it; then delete the user in Supabase → Authentication → Users. Deleting the user alone also works, because its profile and appointment go with it.
2. **Pilot drill** with a barangay, then log its feedback as incorporated or deferred.

## Owner's decisions (26 September)

- Calibration: "Auto, floor stays". The loop moves each barangay's bar by itself, logs every move to the action record, and never goes below 3 reporters and trust 1.0.
- The test accounts keep their current passwords.
- Barangays: "My barangay + view others". Alerts come for the barangay a resident picks; a report counts where GPS says they are.
- Home radius (28 September): 2 km stays. Within it, a report counts for the resident's own barangay.
- Barangay details (28 September): one language is enough for the instructions; up to 3 hotline numbers; stored in the barangay's own row.

## Open work

- The calibration loop's first real event: record the outcome in the Stage 4 plan when one happens.
- Not started, listed in the PRD Build Status:
  - Real hazard data: every barangay's hazard is "Unknown", so the map's Hazards layer draws nothing until it is loaded.
  - The prediction engine, so `predicted_timing` stays empty and the loop compares outcomes, not timings.
  - The cascade heads-up downstream.
  - Self-hosted routing: directions use the public OSRM server's car profile.
  - Geofence and rate limit for pins and votes.
  - Data export and deletion (RA 10173 Article 16).
  - Clean-up of unused anonymous identities.

## Risks to keep in mind

- **Test passwords:** they were shared in chat and are kept by the owner's decision, and the admin test account controls the live system.
- **Impersonation:** with email confirmation off, anyone can register any email. Confirm an official's email by phone or in person before appointing them, and prefer their Google account.
- **Security questions:** someone who knows the resident can guess the answers. The limit is 5 tries an hour per email, with no per-IP limit.
- **Email volume:** a free Gmail account sends about 500 emails a day.
- **The bar only rises with officials' verdicts.** An official who rejects correct advisories raises their barangay's bar; the dashboard's Calibration panel shows every move.
- **Abuse the database cannot stop** (the `abuse.sql` header): GPS spoofed to a point inside the barangay, identities made a day ahead, several established identities agreeing on "dry", and new anonymous identities, limited only by Supabase's per-IP rate limit.

## Checks

- App: `npm run lint`, `npm run typecheck`, `npm test`, `npm run knip`, `npm run build`.
- Database: start Supabase the way CI does, then run `helpers.sql`, `reference-tables.sql`, `rls.sql`, `abuse.sql`, `accounts.sql` and `calibration.sql` with `psql` (see `.github/workflows/ci.yml`).
- Last run, 28 September, locally: 1,778 app tests pass; lint (two old warnings in a test), typecheck, knip and build are clean. The database suites run in CI on every push.

## Where things live

- Calibration: the `20260926010743` and `20260926062859` migrations (`private.report_evidence` is the one rule for which reports count), `supabase/tests/calibration.sql`, `src/features/admin/calibration-panel.tsx`, `src/features/alerts/confidence-tag.tsx`, `src/app/api/alert-bars/route.ts` and `alertBar` in `src/lib/weather-thresholds.ts`.
- Read-aloud: `src/features/alerts/read-aloud-button.tsx`.
- Accessibility: `src/features/map/map-centre-placer.tsx`, and the tests `src/app/colour-contrast.test.ts` and `src/app/page-titles.test.ts`.
- Scheduling: the `20260925135257` migration.
- Anti-abuse: the `20260925123429` migration and `supabase/tests/abuse.sql`.
- Barangay details: `src/features/admin/barangay-details-form.tsx`, `src/features/evacuation/place-centre-on-map.tsx`, `src/lib/barangay-details.ts` (the rules, `telHref`, `instructionsFor`), `src/app/api/barangay-details/route.ts`, `applyDetailsOverlay` in `src/lib/reference-data/types.ts`, and the `20260928083830` and `20260928123726` migrations.
- Changing and viewing a barangay: `src/features/zones/change-barangay-dialog.tsx`, `barangay-bar.tsx` and `use-viewed-zone.ts`; `src/lib/where-you-are.ts` (`HOME_RADIUS_METERS`); `src/lib/follow-email-alerts.ts`; `followPushSubscription` in `src/lib/push-subscription.ts`; `pageWithQuery` in `public/sw.js`.
- Consent notice: `CONSENT_ITEMS` in `src/features/onboarding/consent-notice.tsx`, versioned by `CONSENT_VERSION` in `onboarding-storage.ts`.
