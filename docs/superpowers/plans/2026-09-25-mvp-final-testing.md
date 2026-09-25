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
| Calibration loop run against at least one real event | Not started (Task 3) |
| WCAG 2.1 AA audit with no outstanding violations | Not started (Task 4). The automated axe sweep already runs in CI |
| Pilot barangay completes a drill; feedback incorporated or deferred | The owner's task. Drill mode exists at `/admin/simulation` |

The other Stage 4 items: reputation scoring, outlier downweighting and device-fingerprint hardening are in Task 1. TTS is Task 5.

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

### Task 2: Refresh the PRD's Build Status

- [ ] The table is dated 15 September and still describes Stage 2 (for example, geofence and rate limit as "Not started"). Rewrite it from the code, and add the Task 1 rows.

### Task 3: Calibration loop

- [ ] Record prediction against outcome for each event. Verdicts already give the outcome for automatic advisories. Add predicted timing against observed reports for the prediction timeline.
- [ ] Confidence tags: Estimated → Validated → Calibrated, shown wherever an alert is (the `alerts.confidence` column exists).
- [ ] Tune thresholds within guardrails: too many rejected advisories raise the engine's floors, missed events lower them. Log every change to the action record.
- [ ] Run it against at least one real event, and record the result here.

### Task 4: WCAG 2.1 AA audit

- [ ] Manual pass over every route: keyboard only, focus order and visibility, reflow at 320 px, contrast in both themes, screen-reader names, `lang` on Filipino text.
- [ ] Fix each violation. Add a regression test where the axe sweep cannot see it.

### Task 5: TTS

- [ ] Read-aloud exists on alert details. Extend it to evacuation instructions, and add a fallback for devices without a Filipino voice.
