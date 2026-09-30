# Rain heads-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every hour, barangays in towns with an appointed official get a clearly marked Forecast advisory, with its expected start time, when Open-Meteo forecasts 15 mm or more in an hour within the next 6 hours.

**Architecture:** A cron route reads one Open-Meteo forecast for all those barangays and calls a service-role database function per barangay, which raises, keeps or ends a `source = 'predicted'` alert through the existing `set_zone_alert`. The crowd engine stops treating a forecast advisory as an alert, so residents' reports replace it, and calibration counts an official's alert over a forecast as one raised from nothing. A GitHub workflow calls the route; `pg_cron` starts it at five past every hour.

**Tech Stack:** Postgres (Supabase), plpgsql, `pg_cron`, Next.js 16 route handlers, Open-Meteo forecast API (free, no key), GitHub Actions, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-rain-heads-up-design.md`

## Global Constraints

- Barangays: those whose town (first 7 digits of `psgc_barangay_code`) has at least one profile with `role = 'operator'` (today Mapandan, Pangasinan: 15 barangays).
- Trigger: any hour in the next **6** forecast at **15 mm or more** (PAGASA Orange, `THRESHOLDS.orange` in `open-meteo.ts`).
- The advisory: severity `yellow` (Advisory), `source = 'predicted'`, never higher.
- It ends when a run no longer forecasts heavy rain within 6 hours, or **3 hours after the heaviest hour**; residents are not told when it ends. No new one in a barangay within **6 hours** of its last one ending.
- It is raised only in a barangay with no active alert; any other alert replaces it.
- Residents are notified of a new one (push, and email to those with email alerts on), as for any new alert.
- Copy is bilingual (`LocalizedText`), times in Philippine time (`Asia/Manila`).
- One Open-Meteo request per run for all barangays.
- Migrations are applied with `apply_migration`, files renamed to the reported versions, types updated in `database.types.ts`, and checked once on live in a block that ends in an exception. The `pg_cron` job's migration is applied just before promoting the release.
- The service worker `VERSION` goes up once per release, in the release commit, not in this plan.
- Commits are authored by the owner alone: no `Co-Authored-By` lines.

## Review Focus

1. A forecast advisory active when residents report a real flood: the crowd advisory must replace it at once. Test: RH4.
2. An official raising a Warning over a forecast advisory while located reports are coming in: calibration must still record `missed`. Test: RH5.
3. Open-Meteo answering with one location's object instead of an array (a single barangay), or with `null` hours: the route must handle both. Tests: Task 2's single-object and null-hour cases.
4. A run that fails part-way (Open-Meteo down): nothing is raised or ended, and the run fails loudly. Test: Task 2's 502 case.
5. A forecast advisory must not appear in officials' inbox as a stale alert to re-confirm. Test: Task 3's inbox case.

---

### Task 1: The database side

**Files:**
- Create: `supabase/migrations/<version>_forecast_advisory.sql`
- Modify: `supabase/tests/calibration.sql` (block RH), `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: `public.set_zone_alert(p_zone_id text, p_severity text, p_message jsonb, p_source text)` (security invoker; the service role and definer functions may pass any source); `public.check_and_trigger_alerts()` as last defined in `20260926062859_missed_needs_floor_evidence.sql` (line 131 skips a barangay with any active alert); `private.confirm_superseded_advisory()` (`20260926010743`, lines 147-175).
- Produces: `public.set_forecast_advisory(p_zone_id text, p_starts_at timestamptz, p_peak_at timestamptz, p_peak_mm numeric, p_message jsonb, p_timing jsonb) returns text`, service role only, answering `'raised'`, `'kept'`, `'ended'` or `'skipped'`:
  - `p_starts_at` null: end the barangay's active `predicted` alert (`is_active = false`, `superseded_at = now()`, `expired_automatically = true`) → `'ended'`, else `'skipped'`;
  - active `predicted` alert: end it if `now() > (predicted_timing->>'peak_at')::timestamptz + interval '3 hours'` → `'ended'`, else `'kept'`;
  - any other active alert → `'skipped'`;
  - a `predicted` alert of this barangay ended within 6 hours → `'skipped'`;
  - otherwise `set_zone_alert(p_zone_id, 'yellow', p_message, 'predicted')`, then set the new row's `predicted_timing = p_timing` → `'raised'`.
  The engine's line-131 check gains `and al.source <> 'predicted'`; `confirm_superseded_advisory`'s `missed` check treats an alert whose superseded row was `predicted` like one with `superseded_severity is null`.

- [ ] **Step 1: Write the failing tests (block RH in `calibration.sql`)**
  - RH1: as the service role, raising in a barangay with no alert returns `'raised'`: one active `yellow` `predicted` alert with the given message and `predicted_timing`; calling again returns `'kept'`.
  - RH2: `null` start ends it (`'ended'`, `expired_automatically`); calling to raise again within 6 hours returns `'skipped'`; a barangay with a manual alert returns `'skipped'` and its alert is untouched.
  - RH3: a forecast advisory whose `peak_at` was 3 hours and a minute ago is ended by the next call (`'ended'`).
  - RH4: with a forecast advisory active, located reports crossing the bar make `check_and_trigger_alerts()` raise its `auto_crowdsourced` advisory, and the forecast one is inactive.
  - RH5: with a forecast advisory active and located reports in, an official's `red` alert records a `missed` calibration event.
  - RH6: `anon` and `authenticated` cannot execute `set_forecast_advisory`.
- [ ] **Step 2: Run the block on live in a rolled-back `do` block** (helpers from `helpers.sql` inside). Expected: RH1-RH5 fail; RH6 fails (no function).
- [ ] **Step 3: Write the migration**: the function (`security definer`, `set search_path = ''`, grants), `create or replace` of `check_and_trigger_alerts` (the latest body, with the one added condition) and of `confirm_superseded_advisory`.
- [ ] **Step 4: Apply it** (name `forecast_advisory`), rename, re-run the block (all pass), `get_advisors` shows nothing new; add `set_forecast_advisory` to `database.types.ts`.
- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_forecast_advisory.sql supabase/tests/calibration.sql src/lib/supabase/database.types.ts
git commit -m "feat: a service-role function raises, keeps and ends Forecast advisories, and residents' reports replace them"
```

### Task 2: The hourly check

**Files:**
- Modify: `src/lib/open-meteo.ts` (+ test): `heavyRainAhead`
- Create: `src/lib/rain-forecast.ts` (+ test): the run
- Create: `src/app/api/rain-forecast/route.ts` (+ test)
- Create: `.github/workflows/rain-forecast.yml`

**Interfaces:**
- Consumes: Task 1's `set_forecast_advisory`; `isAuthorizedCronRequest(request: Request): boolean`; `notifyResidentsOfAlertChange(zoneId: string, change: "set" | "lifted" | "withdrawn")`.
- Produces:
  - `heavyRainAhead(times: string[], mm: (number | null)[]): { startsAt: string; peakAt: string; peakMm: number } | null` — the first hour at 15 mm or more and the heaviest hour, over the hours given (`null` hours count as 0).
  - `forecastAdvisoryCopy(startsAt: string, peakMm: number): { message: LocalizedText; timing: LocalizedText }`:
    - message en "Forecast advisory — heavy rain expected from about {3 PM} (up to {22} mm in an hour, Open-Meteo forecast). Prepare now; this is a forecast, not a report."
    - message fil "Paalala mula sa forecast — inaasahan ang malakas na ulan mula bandang {3 PM} (hanggang {22} mm sa isang oras, ayon sa forecast ng Open-Meteo). Maghanda na; forecast ito, hindi ulat."
    - timing en "From about {3 PM}", fil "Mula bandang {3 PM}" (hour in `Asia/Manila`, `en-PH` format, peak rounded to whole mm)
  - `runRainForecast(): Promise<{ checked: number; raised: string[]; ended: number }>`, which throws when Open-Meteo fails.
  - `GET /api/rain-forecast`: 401 without the cron secret; 200 with the run's result; 502 when the run throws.
  - `rain-forecast.yml`: `workflow_dispatch` and `schedule: "5 * * * *"`, calling the route with `Authorization: Bearer ${{ secrets.CRON_SECRET }}`, in the shape of `threshold-check.yml`.

- [ ] **Step 1: Write the failing tests**
  - `heavyRainAhead`: `[2, 16, 22, 9]` → starts at the second hour, peaks at the third with 22; `[14.9, 3]` → `null`; `[null, 15]` → starts and peaks at the second hour.
  - `forecastAdvisoryCopy("2026-10-01T07:00:00Z", 21.6)` → en message and timing with "3 PM" and "22".
  - `runRainForecast`, with the database and `fetch` mocked: reads the barangays of towns with an operator; makes exactly one Open-Meteo request, whose URL has every barangay's latitude and longitude as comma lists, `hourly=precipitation`, `forecast_hours=6`, `timezone=UTC`; calls `set_forecast_advisory` for every barangay (heavy rain → the times, peak and copy; none → `null`s); calls `notifyResidentsOfAlertChange(id, "set")` only for `'raised'`; accepts a single object in place of an array; throws, calling nothing, when Open-Meteo answers 500.
  - The route: 401 without the secret; 200 with the result; 502 when the run throws.
- [ ] **Step 2: Run them.** `npx vitest run src/lib/open-meteo.test.ts src/lib/rain-forecast.test.ts src/app/api/rain-forecast` — Expected: FAIL.
- [ ] **Step 3: Implement**, following `/api/threshold-check` for the route and `notify-residents.ts`'s service client for the run.
- [ ] **Step 4: Run them again**, then `npm test`. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add src/lib/open-meteo.ts src/lib/open-meteo.test.ts src/lib/rain-forecast.ts src/lib/rain-forecast.test.ts src/app/api/rain-forecast .github/workflows/rain-forecast.yml
git commit -m "feat: an hourly check raises a Forecast advisory hours ahead of heavy rain in the pilot towns"
```

### Task 3: How it looks

**Files:**
- Modify: `src/features/alerts/confidence-tag.tsx`, `src/features/alerts/alert-details.tsx`, `src/features/admin/official-inbox.tsx`
- Test: their test files

**Interfaces:**
- Consumes: `AlertRecord.source === "predicted"` and `AlertRecord.predictedTiming?: LocalizedText` (already mapped by `alerts-mapper.ts`).
- Produces: nothing new for other tasks.

- [ ] **Step 1: Write the failing tests**
  - `ConfidenceTag` for `source: "predicted"` reads en "Forecast" / fil "Pagtataya", whatever the confidence.
  - `AlertDetails` for a predicted alert shows en "Expected: From about 3 PM" / fil "Inaasahan: Mula bandang 3 PM"; for any other alert, nothing new.
  - The officials' inbox does not list an active forecast advisory as stale, however old; a manual alert still becomes stale as today.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again**, then `npm test`, `npm run lint`, `npm run typecheck`, `npm run knip`, `npm run build`. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add src/features/alerts src/features/admin/official-inbox.tsx src/features/admin/official-inbox.test.tsx
git commit -m "feat: a Forecast advisory is tagged Forecast and shows its expected time, and is never asked to be re-confirmed"
```

### Task 4: The schedule and docs

**Files:**
- Create: `supabase/migrations/<version>_dispatch_rain_forecast.sql` (applied just before promoting the release)
- Modify: `PRD.md` (Prediction engine row: the rain heads-up is Built; Scheduled jobs row), `handoff.md`, `README.md` (Deployment: the new workflow)

**Interfaces:**
- Consumes: `private.dispatch_workflow(p_workflow text)`.
- Produces: the `pg_cron` job `dispatch-rain-forecast`, `'5 * * * *'`.

- [ ] **Step 1: Write the migration file** (`select cron.schedule('dispatch-rain-forecast', '5 * * * *', $$select private.dispatch_workflow('rain-forecast.yml')$$);`) and the docs. Do not apply it yet: the release applies it.
- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/*_dispatch_rain_forecast.sql PRD.md handoff.md README.md
git commit -m "docs: PRD, README and handoff for the rain heads-up; its schedule, applied at release"
```

## Rulings made while planning

- **An official's alert over a Forecast advisory counts as raised from nothing for calibration** (`missed`), which the spec's "it never moves a barangay's bar" implies but does not say: without it, a forecast would hide a missed flood from the loop. Cost if wrong: a bar moves once where the owner would not have wanted it.
- **The action record names it "Automatic — predicted"**, the name the existing `record_alert_set` gives any engine source, where the spec wrote "Automatic — forecast". Cost if wrong: a word.
- **The pg_cron migration gets its own file, applied at release**, as the spec's rollout says; its version is whatever `apply_migration` reports then.
