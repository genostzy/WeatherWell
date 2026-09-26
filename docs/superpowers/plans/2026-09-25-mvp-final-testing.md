# Stage 4 (`mvp`) — Final Testing Plan

**Goal:** Meet the PRD's Stage 4 exit criteria: anti-abuse layers 1–6 live with a documented abuse-attempt suite passing, the calibration loop run against a real event, a WCAG 2.1 AA audit passing, and a pilot drill completed.

**Branch:** `mvp`, cut from `v1` at `912a5cb`. `v1` stays the production branch until `mvp` is merged.

## Global constraints

- **Both migrations are applied to the live database** (25 September): `20260925123429_reputation_and_identity_age` and `20260925123519_password_recovery_and_email_alerts`, with the files renamed to the live versions (the M2 rule in `2026-09-23-stop-the-bleeding.md`). Production shares the database, so it already runs the new engine rules.
- Every database rule is tested in `supabase/tests/`: `rls.sql` for access and the engine, `abuse.sql` for attacks. Both run in CI against a database rebuilt from the migrations.

## Status by exit criterion

| Exit criterion | Status |
|---|---|
| Anti-abuse layers 1–6 live, documented abuse-attempt suite passes | Built (Task 1). The database side is live; the app side ships when `mvp` merges |
| Calibration loop run against at least one real event | Built and recording (Task 3). Waits for a real flood: on 26 September the live database held 5 automatic advisories, all from labelled test data, and no calibration outcomes |
| WCAG 2.1 AA audit with no outstanding violations | Passed on 26 September (Task 4), after the fixes in `1e63060` |
| Pilot barangay completes a drill; feedback incorporated or deferred | The owner's task. Drill mode exists at `/admin/simulation` |

The other Stage 4 items: reputation scoring, outlier downweighting and device-fingerprint hardening are in Task 1. TTS is Task 5. Privacy fixes from the consent review landed between them (`a402774`–`8fa9dd9`).

---

### Task 1: Anti-abuse layers 1–6 and the abuse-attempt suite — done

- [x] **Layer 6, reputation.** `alerts.verdict` records an official's decision on an automatic advisory. Confirming it (any official alert replacing it) marks it `confirmed`; the inbox's Reject calls `reject_automatic_alert`, which marks it `rejected`. A plain clear records nothing, because an all-clear after the water goes down says nothing about the reports. A device whose flood reports helped raise more confirmed than rejected advisories gains 0.3; more rejected than confirmed, it weighs 0 and stops counting until a confirmed one evens it out.
- [x] **Identity-age hardening** (the chosen form of device-fingerprint hardening; it collects nothing new). An identity made less than a day before its report earns no bonuses and cannot set the outlier consensus, and the engine needs at least one reporter whose identity is over a day old. `water_level_reports.reporter_established` records this at insert; it is public like `trust_weight`, so the app's own count can mirror the engine.
- [x] **Layer 2 hole found by the suite.** The rate limit read the client-sent `reported_at`, so backdating each report dodged it. It now reads `received_at`, which only the database sets.
- [x] **Layer 4 hole found by the suite.** The outlier consensus counted reports, not reporters, so one device repeating "dry" could push real flood reports out. It now takes each reporter's latest report, from established reporters only.
- [x] **Suite:** `supabase/tests/abuse.sql`. Blocks A1–A5 (layers 1–5), H1–H3 (identity age) and R1–R6 (layer 6). Each block was checked against the old code and fails there. Its header lists the known limits nothing in the database can stop.
- [x] **App:** Reject is a recorded rejection, and the inbox warns what it costs. `countsTowardAlert` leaves out weight-0 devices, and the officials' threshold badge needs an established reporter.

### Owner request, 25 September: accounts and email — built

- [x] Password sign-up without email confirmation: the account signs in at once, once "Confirm email" is off in Supabase (PRD Setup, the note after step 6).
- [x] Forgot password by two security questions, residents only, answers stored as bcrypt hashes, 5 tries an hour; officials get a new password from an admin at `/admin/officials`.
- [x] Opt-in email alerts for Google accounts, sent from a Gmail app password (PRD Setup step 8), with one-click unsubscribe. Residents now also hear, by push and email, when an official sets, changes, lifts or rejects their barangay's alert.
- [x] `scripts/reset-test-accounts.ts` replaces the test accounts (PRD Setup step 9).

### Task 2: Refresh the PRD's Build Status — done

- [x] Rewritten from the code and the live database on 26 September, in five groups (residents, alerts, officials, anti-abuse, platform). It records what Stage 3 left undone (hazard data, self-hosted routing, the prediction engine, the cascade heads-up), what was removed (the risk score, built on invented numbers), and two privacy items not started: data export and deletion, and clean-up of unused anonymous identities.
- [x] PRD Setup step 10: the GitHub token in Vault that lets `pg_cron` start the scheduled workflows on time.

### Task 3: Calibration loop — built; the real-event run is open

- [x] Each automatic advisory's outcome is recorded in `calibration_events`: confirmed, rejected, expired without a verdict, or missed (an official raised the alert while located flood reports were arriving and the engine had stayed quiet). Migration `20260926010743_calibration_loop`, tests `supabase/tests/calibration.sql` C1–C8.
- [x] Confidence tags, set at insert: *Estimated*, *Validated* once the barangay has 3 confirmed advisories, *Calibrated* once 10 are settled and the bar has moved. Shown on alert details and in the officials' inbox; an official's own alert says so.
- [x] Guardrails, as the owner chose on 26 September ("Auto, floor stays"): each barangay has its own bar. At least two rejections, outnumbering confirmations since the last move and within 90 days, raise it a step (reporters 3→4→5, trust 1.0→1.25→…→2.0); a missed event lowers it a step, never below 3 and 1.0. Every move is `engine.tuned` in the action record, credited "Automatic — calibration", and `/admin/history` describes it in words. Officials see outcomes and raised bars on the dashboard; residents' "how many more" follows the bar.
- [ ] Run it against at least one real event, and record the result here. Needs a real flood.
- Ruling: predicted timing against observed reports is not recorded. Nothing writes `alerts.predicted_timing`, because the prediction engine was never built (see the PRD Build Status). The outcome record covers what the engine does decide, and a timeline comparison waits for a prediction engine. Cost if wrong: the exit criterion's "prediction-versus-actual" is read as outcome-versus-actual until then.

### Task 4: WCAG 2.1 AA audit — passed on 26 September

- [x] Manual pass over every route: keyboard only, focus order and visibility, reflow at 320 px, contrast, screen-reader names and `lang`. Pages behind sign-in were checked in the tests and the code, since the audit does not sign in. The app is dark-only, so "both themes" is one theme: a light preference renders dark.
- [x] Violations found and fixed (`1e63060`):
  - 2.1.1 Keyboard: placing a flood pin or an official marker needed a pointer. The arrow keys now move the focused map, and a button under the crosshair places at its centre.
  - 1.4.11 Non-text contrast: form fields' edges were 1.2:1 against the page (now 3:1 or more), and the focus ring was drawn at half strength (now full).
  - 1.3.1 Info and relationships: card titles were not headings.
  - 3.1.1 Language of page: `lang` stayed `en` after switching to Filipino.
  - 2.2.1 Timing adjustable: the one-tap report's confirmation vanished after 3 seconds, and its error and withdrawal messages after 4. Now only Undo expires.
  - 2.4.2 Page titled: every page was titled "WeatherWell".
- [x] Regression tests where axe cannot see: `src/app/colour-contrast.test.ts` computes the palette's contrast from `globals.css`, and `src/app/page-titles.test.ts` checks every page has a title. The rest have component tests.
- Passing without changes, on every page the audit opened: text contrast (4.5:1 or more), names on every control, alt text, reflow at 320 px with no sideways scroll, landmarks, and no orientation lock.

### Task 5: TTS — done

- [x] One read-aloud button (`src/features/alerts/read-aloud-button.tsx`) on alert details and evacuation instructions (`43d3145`). It uses a Filipino voice when the phone lists one; when the phone lists voices but none is Filipino, it reads the English text in `en-PH` and says so on screen.
