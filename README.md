# WeatherWell

[![CI](https://github.com/genostzy/WeatherWell/actions/workflows/ci.yml/badge.svg?branch=hi-fi)](https://github.com/genostzy/WeatherWell/actions/workflows/ci.yml)

An offline-first flood-alert PWA for Philippine barangays. Residents get
street-level "should I evacuate now?" answers instead of province-level
bulletins, and keep getting them when the network goes down.

## Why

The Philippines averages twenty tropical cyclones a year, and severe ones take
out internet and cellular service exactly when early warning matters most.
Existing systems assume a live connection. National bulletins warn by province,
not by street. Real water-level sensors cost more than a barangay can afford.

WeatherWell answers those with a service-worker cache that survives the outage,
crowdsourced water-level reports in place of hardware sensors, cascade warnings
that use an upstream zone's flooding to warn the one downstream, and a drill
mode so officers can practise issuing an alert before a real event.

See [PRD.md](PRD.md) for the full product definition.

## Project status

**Phase 1 (`hi-fi`) — UI only. No backend. All data is mock.**

Every screen is built and click-through-able from a fresh first run, but
nothing leaves the browser: state lives in `localStorage`, alerts are fixtures,
and `/admin` is an unauthenticated demo surface that takes no real action. Real
data, auth, offline sync, and the threshold engine land in later phases — the
roadmap is in [PRD.md](PRD.md#implementation-phases).

Four mock barangays (Mapandan, Mangaldan, Manaoag, Santa Barbara) ship with the
build so zone selection, the upstream→downstream cascade chain, and the
"no active alert" state are all exercisable.

## Getting started

Requires Node 20.9 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000. The first visit runs onboarding; pick a zone
to reach the homepage map.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` (route types) then `tsc --noEmit` |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest in watch mode |
| `npm run knip` | Unused files, exports, and dependencies |

CI runs all five checks on every push.

## Screens

| Route | Who | What |
| --- | --- | --- |
| `/` | Resident | Homepage map — live position, zone status, POI and community pins, safest route to the evacuation center |
| `/onboarding` | Resident | First-run consent and zone selection |
| `/map` | Resident | Multi-zone overview, filterable by status |
| `/report` | Resident | Water-level report on the ankle/knee/waist/neck scale |
| `/evacuation` | Resident | Per-zone instructions, capacity, and the "I'm safe" / "I need help" check-in |
| `/admin` | Admin | Monitoring dashboard — hazards, trends, analytics, pin moderation |
| `/admin/map` | Admin | Operations map — override an alert, log a headcount, or moderate a pin in place |
| `/admin/zone/[zoneId]` | Admin | Single-zone management and check-in summary |
| `/admin/simulation` | Admin | Drill mode — six scenarios, notifies nobody |

## Architecture

Next.js 16 App Router with Turbopack, React 19, Tailwind 4, and shadcn/ui
components on Radix. Maps are Leaflet via react-leaflet.

```
src/app/         Routes (App Router)
src/features/    Feature modules — admin, alerts, evacuation, homepage-map,
                 map (shared map layer), onboarding, water-level-report, zones
src/lib/         Domain logic, stores, and mock data
src/components/  Shared UI, including vendored shadcn primitives in ui/
```

A few conventions worth knowing before editing:

**Leaflet is browser-only.** Map components load through
`next/dynamic(..., { ssr: false })`. Importing one directly into a server
component will break the build.

**Every user-facing string is bilingual.** Strings are declared as
`LocalizedText = { en, fil }` and rendered with `t(text, lang)` — there are no
bare display strings in components.

**Two severity vocabularies, deliberately.** Alerts carry a PAGASA-aligned
`Severity` (`yellow` → `orange` → `red` → `evacuate`); the map shows residents a
plain-language `ZoneStatus` (`safe` / `cautionary` / `dangerous` / `hazardous`).
`getZoneStatus` maps between them, and the colour grammar stays tied to the
severity, not the label.

**Depth maps one tier hotter than it looks.** Both `waist` and `neck` reports
mean `evacuate`. The same water is far more dangerous for a child than an adult,
so waiting for the most extreme adult-scale reading would already be too late —
see the comment on `DEPTH_SEVERITY` in [src/lib/depth.ts](src/lib/depth.ts).

**State is `localStorage` behind `useSyncExternalStore`.** Stores are built by
`createLocalStorageStore` under the `weatherwell.*` key namespace
(`selectedZoneId`, `waterLevelReports`, `communityPins`, `communityPinVotes`,
`zoneOverrides`, `evacuationCheckIns`, `deviceId`, `onboarded`). Clearing site
data resets the app to first run.

## Testing

Vitest with Testing Library and jsdom; `axe-core` drives a cross-cutting
accessibility sweep in `src/features/a11y/`. Tests sit beside the code they
cover as `*.test.ts(x)`.

```bash
npm test
```

Because jsdom has no layout engine, map tests assert that markers and controls
render and that using one writes to the store behind it — not that Leaflet's
pixel maths is right.

## Documentation

- [PRD.md](PRD.md) — product requirements, phasing, and open risks
- [AGENTS.md](AGENTS.md) — notes for AI coding agents working in this repo
- [docs/](docs/) — design specs and implementation plans
