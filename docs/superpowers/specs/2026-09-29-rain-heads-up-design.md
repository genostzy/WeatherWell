# Rain heads-up: the first step of prediction — Design

**Date:** 29 September 2026 · **Status:** design, for the owner's review

## Why

Every alert WeatherWell raises today comes after the water: residents' reports (the crowd engine) or an official's decision. The PRD lists the prediction engine as not started, and `alerts.predicted_timing` exists but nothing writes it. The app already reads free Open-Meteo rain forecasts on the phone (`forecastSteps` in `src/lib/open-meteo.ts`, PAGASA's 7.5 / 15 / 30 mm-an-hour levels) and shows them in the current-conditions panel, but only to someone who opens it. A resident whose barangay is about to get heavy rain hears nothing until the flooding is reported.

The `alerts` table already accepts a `predicted` source. This design uses it: hours ahead of heavy rain, the barangay gets a clearly marked forecast advisory with the time it is expected.

## Decisions (owner, 29 September)

- **Build the rain heads-up now**: the server checks free Open-Meteo rain forecasts for the pilot town's barangays and raises a clearly marked forecast advisory with its expected start time. Zero cost, no key.

The details, which the owner can change in review:

- **Which barangays:** those in a town with at least one appointed official. Today that is Mapandan, Pangasinan: 15 barangays. A new pilot town joins by appointing its first official.
- **When:** any hour in the next 6 forecast at 15 mm or more (PAGASA's Orange rainfall level).
- **What:** an Advisory, the lowest level, marked Forecast, never higher. Officials decide anything above it.

## What residents see

In a barangay with no alert, when heavy rain is forecast within 6 hours:

- the alert card: **Forecast advisory** — "Heavy rain expected from about 3 PM (up to 22 mm in an hour, Open-Meteo forecast). Prepare now; this is a forecast, not a report." The tag reads "Forecast" in place of the confidence tag;
- a push, and an email to those with email alerts on, as for any new alert.

It ends by itself when the forecast no longer shows heavy rain within 6 hours, or 3 hours after the heaviest hour, whichever comes first, and residents are not told again (an ending forecast is not an all-clear). The same barangay gets no new forecast advisory within 6 hours of the last one ending.

## What officials see

The advisory appears on their dashboard like the others, recorded in the action record as "Automatic — forecast". They can lift it, or set any alert, which replaces it. They are not asked to confirm or reject it: it predicts weather, not flooding, so it never moves a barangay's bar in the calibration loop.

## How it is built

**1. The check.** A new route, `POST /api/rain-forecast`, behind the cron secret like `/api/threshold-check`. It reads the barangays of towns with an appointed official, asks Open-Meteo once for all their points (the API takes lists of coordinates), and runs each barangay's next 6 hours through a new `heavyRainAhead(hours)` in `open-meteo.ts`, next to `forecastSteps` and reusing its thresholds: the first hour at 15 mm or more, and the heaviest.

**2. Raising and ending.** A new `security definer` function, `set_forecast_advisory(p_zone_id text, p_starts_at timestamptz, p_peak_mm numeric, p_peak_at timestamptz)`, for the service role only. It raises a `yellow`, `source = 'predicted'` alert with `predicted_timing = {starts_at, peak_mm_per_hour, peak_at, provider: "open-meteo"}` only when the barangay has no active alert and none of its forecast advisories ended in the last 6 hours; with `null` arguments it ends the barangay's active forecast advisory (`expired_automatically`). The route calls it for every checked barangay each run, so a forecast that fades ends the advisory, and the 3-hours-after-the-peak rule ends any that runs on.

**3. Crowd reports come first.** The crowd engine (`check_and_trigger_alerts`) today skips any barangay with an active alert. It learns to treat an active forecast advisory as no alert: when residents' reports cross the bar, their advisory replaces the forecast one, so a forecast can never hide a real flood.

**4. Telling residents.** The route calls `notifyResidentsOfAlertChange(zoneId, "set")` for each advisory it raised, as the crowd engine's path does. Ending one sends nothing.

**5. The schedule.** A GitHub workflow, `rain-forecast.yml`, calls the route. Supabase's `pg_cron` starts it at five past every hour through `private.dispatch_workflow`, like the others; GitHub's own schedule is the fallback. One Open-Meteo call an hour, far below its free limit.

**6. Screens.** The alert card and the dashboard read `source = 'predicted'` and show "Forecast" and the expected time from `predicted_timing`. Service worker bump.

## Not in this change

- Forecasting floods rather than rain (river levels, how deep): GloFAS river forecasts are already on the phone (`river-forecast.ts`) and are the next step.
- Forecast advisories above Advisory, and forecast alerts for towns without officials.
- Comparing forecasts with what happened in the calibration record; the forecast advisories' `predicted_timing` makes that possible later.

## Rollout

Two migrations. The first goes to the live database early; it only adds a function and changes the crowd engine in a way that leaves every current case the same. The second adds the `pg_cron` job, and is applied just before promoting the release: the job starts a workflow that calls a route the production app does not have yet, and a run before the release would answer 404, fail and email the owner. GitHub's own hourly schedule could still fire once between the push and the promotion; at worst that is one failed run and one email.

## Testing

- **Database** (in CI; checked once on live in a rolled-back transaction): `set_forecast_advisory` raises a Forecast advisory only in a barangay with no active alert and no forecast advisory ended in the last 6 hours, ends it with `null`s, and refuses every caller but the service role; a crowd advisory replaces a forecast one; a forecast advisory never moves the bar.
- **Rule:** `heavyRainAhead` finds the first hour at 15 mm or more and the heaviest, and nothing below 15 mm.
- **Route:** refuses without the cron secret; one Open-Meteo request for all the barangays; raises, keeps and ends advisories as the forecast changes; notifies residents only for new ones; a failed Open-Meteo request changes nothing and fails the run, which emails the owner.
- **Screens:** the Forecast tag and the expected time on the alert card and the dashboard.
