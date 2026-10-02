# WeatherWell

[![CI](https://github.com/genostzy/WeatherWell/actions/workflows/ci.yml/badge.svg?branch=mvp)](https://github.com/genostzy/WeatherWell/actions/workflows/ci.yml)

An offline-first flood-alert PWA for Philippine barangays. Residents get
barangay-level "should I evacuate now?" answers instead of province-level
bulletins, and keep getting them when the network goes down.

Live: **https://weatherwell.vercel.app**

## Why

The Philippines averages twenty tropical cyclones a year, and severe ones take
out internet and cellular service exactly when early warning matters most.
Existing systems assume a live connection. National bulletins warn by province,
not by barangay. Real water-level sensors cost more than a barangay can afford.

WeatherWell answers those with free forecasts (rain hours ahead, rivers days
ahead), crowdsourced water-level reports weighed by how much each device has
earned trust, alerts that officials confirm, a service-worker cache that
survives the outage, and alerts residents can pass on by SMS to neighbours
without the app.

See [PRD.md](PRD.md) for the full product definition.

## Status — V1

Everything runs on free tiers and free public data. No paid services, no keys
beyond the project's own.

- **All 41,803 barangays** are selectable. Each gets alerts, live weather, a
  river outlook and neighbours' reports.
- **Coverage is honest.** Only a barangay with a verified hotline and
  evacuation centre is "covered"; the rest are labelled *Alerts only*. At the
  time of writing no barangay is fully covered: hotlines and centres come from
  the barangays themselves (officials can confirm a centre from nearby
  OpenStreetMap sites).
- **No mock data in production.** An ESLint rule keeps `src/lib/mock-data`
  to tests and the `/admin/simulation` drill.

### Data sources

| What | Source | Notes |
| --- | --- | --- |
| Rain now, last 12 h, next 6 h | Open-Meteo forecast API | Free, no key |
| River outlook, next 7 days | Open-Meteo flood API (GloFAS) | Free, no key |
| Elevation | Open-Meteo elevation API | Free, no key; position rounded to ~100 m, never stored |
| Typhoon bulletin | PAGASA (scraped), GDACS as backup | Backup is labelled; never claims a wind signal |
| Likely evacuation sites | OpenStreetMap (Overpass) | Shown as unconfirmed until an official confirms one |
| Barangays | PSA PSGC + NAMRIA boundaries | Seeded once; served compacted from `/data/reference-data.json` |
| Alerts, reports, check-ins, centres | Supabase (Postgres + RLS) | |

## How alerts work

1. Residents report water depth, at most once per barangay every 5 minutes.
   Each report is scored by the database at insert: any device counts 0.2.
   An identity over a day old gains for a prior check-in in that barangay, a
   history older than a day, and past reports others corroborated; a device
   whose advisories officials confirmed gains 0.3 (max 1.0), and one whose
   advisories they rejected more often counts 0. A report three depth levels
   off what established neighbours report is an outlier.
2. The engine raises an **unverified yellow advisory** when enough located
   reporters report flooding within 6 hours, at least one of them with an
   identity over a day old. Each barangay has its own bar: 3 reporters with
   combined trust ≥ 1.0 to start. The calibration loop raises it a step
   (to at most 5 and 2.0) when officials keep rejecting its advisories, and
   lowers it again after a flood the engine missed. The engine withdraws its
   own advisory when the evidence ages out.
3. Officials see it under **Needs your attention** and confirm it (re-issued
   as theirs) or reject it as false, which counts against the devices that
   raised it. Their own alerts never expire, but are listed for review once a
   day old.
4. Residents see the alert with its age, whether an official confirmed it,
   its confidence (Estimated, Validated, Calibrated), read-aloud, share, and one-tap SMS to up to 5 saved neighbours. Forwarded
   links (`/a?d=…`) render as plain HTML with JavaScript off.
5. Residents who turned alerts on get a push when an advisory is raised and
   whenever an official sets, changes, lifts or rejects their barangay's
   alert; those signed in with Google can also turn on email alerts.

## Getting started

Requires Node 20.9 or newer (CI uses 24).

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only: alert engine, push, cron jobs |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push (generate with `npx tsx scripts/generate-vapid-keys.ts`) |
| `CRON_SECRET` | Guards the cron routes (also a GitHub Actions secret) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Email alerts, sent from WeatherWell's own Gmail account (PRD Setup step 8) |
| `APP_URL` | Optional: where links in emails point (defaults to production) |
| `OSRM_BASE_URL` | Optional routing server (defaults to the free FOSSGIS walking router) |

Then open http://localhost:3000. The first visit runs onboarding.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |
| `npm test` | Vitest, single run |
| `npm run knip` | Unused files, exports and dependencies |
| `npm run generate-data` | Rebuild `public/data/reference-data.json` from the database |
| `npx tsx scripts/reset-test-accounts.ts` | Replace the test accounts (shows the plan; `--yes` does it) |

## Screens

| Route | Who | What |
| --- | --- | --- |
| `/` | Resident | Status, alert details, live weather and river outlook, report, map. `?zone=` views another barangay |
| `/onboarding` | Resident | Consent and barangay selection |
| `/forgot-password` | Resident | New password after answering two security questions |
| `/unsubscribe` | Anyone | Stops email alerts, from the link in an email |
| `/map` | Resident | Multi-barangay overview |
| `/report` | Resident | Water-level report (ankle / knee / waist / neck) |
| `/evacuation` | Resident | Instructions, likely sites, "How high am I?", emergency card, neighbours to text, check-in. `?zone=` for another barangay |
| `/a` | Anyone | A forwarded alert, readable without the app or JavaScript |
| `/admin` | Official | Needs your attention, three-step alert, figures, monitoring |
| `/admin/map` | Official | Operations map |
| `/admin/zone/[zoneId]` | Official | One barangay: alert, centre, rain and river, reports; its hotlines, evacuation instructions and centre, edited here |
| `/admin/history` | Official | Every recorded action |
| `/admin/officials` | Admin | Appoint and remove officials |
| `/admin/simulation` | Official | Drill mode; notifies nobody |

## Architecture

Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui on Radix, Leaflet via
react-leaflet, Supabase for data and auth.

```
src/app/         Routes, API routes, server actions
src/features/    Feature modules
src/lib/         Domain logic, data access, stores
supabase/        Migrations (match the live history), tests/ (RLS, abuse, accounts, calibration)
public/sw.js     Service worker: offline shell, caches, outbox drain
```

Conventions worth knowing before editing:

- **Leaflet is browser-only.** Map components load through
  `next/dynamic(..., { ssr: false })`.
- **Every user-facing string is bilingual**: `LocalizedText = { en, fil }`,
  rendered with `t(text, lang)`.
- **Two severity vocabularies, deliberately.** Alerts carry a PAGASA-aligned
  `Severity` (`yellow` → `orange` → `red` → `evacuate`); residents see a
  plain-language `ZoneStatus` (`safe` / `cautionary` / `dangerous` /
  `hazardous`).
- **Depth maps one tier hotter than it looks.** Both `waist` and `neck` mean
  `evacuate` — see `DEPTH_SEVERITY` in [src/lib/depth.ts](src/lib/depth.ts).
- **The database enforces the rules.** Area checks, trust scoring, the rate
  limit and geofence, and the alert engine live in Postgres; the app never
  relies on the client for them.
- **Writes queue offline.** Reports, pins, votes and check-ins go through an
  outbox that the service worker drains when the network returns.

## Testing

- `npm test` — Vitest with Testing Library and jsdom, including an axe-core
  accessibility sweep and a render of the admin home over 42,000 barangays.
- CI also rebuilds the database from `supabase/migrations` in Docker
  (`supabase start`) and runs [supabase/tests/rls.sql](supabase/tests/rls.sql):
  RLS, the alert engine, trust weights, centre confirmation, push endpoints,
  and the rate limit and geofence. Then
  [supabase/tests/abuse.sql](supabase/tests/abuse.sql): one documented attack
  per anti-abuse layer, and what stops it. And
  [supabase/tests/accounts.sql](supabase/tests/accounts.sql): password
  recovery and email alerts. And
  [supabase/tests/calibration.sql](supabase/tests/calibration.sql): the
  calibration loop and confidence tags.

## Deployment

- `mvp` is the default branch and the production branch. A push builds a
  Vercel preview; production is released by redeploying that build to
  production.
- Scheduled jobs (GitHub Actions, from `mvp`): the threshold engine and
  typhoon refresh every 3 hours, the rain heads-up (`rain-forecast.yml`,
  `/api/rain-forecast`) every hour at five past, and a production health
  check every 15 minutes. GitHub starts scheduled runs late, so Supabase's `pg_cron`
  also starts them on time, once a GitHub token is in Vault (PRD Setup
  step 10).
- Vercel crons (`vercel.json`), daily: `/api/threshold-check`, `/api/cleanup-weather`,
  `/api/cleanup-pin-photos` (deletes pin photos after 7 days, when their pin is
  removed, or when never attached) and `/api/cron/typhoon`. Each needs `CRON_SECRET`.
- Migrations apply to the one live database immediately: ship app code
  before any migration that removes something the deployed code reads.
- The server functions run in Tokyo (`"regions": ["hnd1"]` in `vercel.json`),
  beside the database (`ap-northeast-1`). In Washington, the default, every
  database call crossed the Pacific and back.
- Older branches are kept as tags: `archive/hi-fi` (phase 1 UI), `archive/v0`,
  `archive/mvp`.

### Backups

Supabase keeps no backups of free-plan projects, so `.github/workflows/backup.yml`
makes one every week (Monday 02:30 in the Philippines; `pg_cron` starts it on
time) and keeps each for 30 days as an encrypted artifact of its run.

Set it up once, in GitHub → Settings → Secrets and variables → Actions:

1. `SUPABASE_DB_URL`: the Session pooler connection string from Supabase →
   Connect, with the database password in it. Nothing else in WeatherWell uses
   that password, so it can be reset in Database → Settings if nobody has it.
2. `BACKUP_PASSPHRASE`: a long random passphrase. Keep a copy outside GitHub:
   without it the backups cannot be opened.

Then start it once from Actions → Backup → Run workflow, and check that the run
ends with a `.gpg` artifact.

To restore, download the `.gpg` file from a Backup run, create a new Supabase
project, and load it (Supabase docs: Backup and Restore using the CLI):

```bash
gpg --decrypt -o backup.tar.gz weatherwell-DATE-runN.tar.gz.gpg
tar xzf backup.tar.gz
psql --single-transaction --variable ON_ERROR_STOP=1 --file backup/roles.sql --file backup/schema.sql --command 'SET session_replication_role = replica' --file backup/data.sql --dbname "$NEW_DB_URL"
psql --single-transaction --variable ON_ERROR_STOP=1 --file backup/history_schema.sql --file backup/history_data.sql --dbname "$NEW_DB_URL"
```

Pin photos in Storage are not in the backup; they are deleted after 7 days anyway.

## Documentation

- [PRD.md](PRD.md) — product requirements
- [USER-MANUAL.md](docs/USER-MANUAL.md) — how to use WeatherWell
- [AGENTS.md](AGENTS.md) — notes for AI coding agents working in this repo
