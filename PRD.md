# PRD

*(Full technical spec also maintained at [docs/superpowers/specs/2026-09-01-citizen-app-phase1-design.md](docs/superpowers/specs/2026-09-01-citizen-app-phase1-design.md))*

## Climate Resilience and Hydrometeorological Disaster Management — Phase 1: Citizen App

### Background

The Philippines experiences an average of twenty tropical cyclones a year. When severe typhoons strike, infrastructure collapse routinely severs internet and cellular connections, cutting off centralized, cloud-based early warning systems precisely when communities need them most. Local communities also struggle to translate broad national weather data into actionable, street-level evacuation protocols, and affordable, localized water-level sensors for real-time flood alerts remain largely unavailable.

### Product Vision

**The neighborhood is both the network and the sensor.** Rather than depending solely on a live connection to a centralized cloud service, the system is designed to keep delivering actionable, street-level guidance through a connectivity outage, and to source local flood conditions from the community itself rather than requiring physical sensor hardware.

### Competitive Landscape (why this isn't a clone)

Existing Philippine systems each solve part of the problem but share a common weakness — all still assume a live connection to deliver anything in real time:

- **ProjectLIGTAS** — live barangay flood map, PAGASA/UP NOAH data aggregation, crowdsourced flood reports. No confirmed offline capability.
- **UP NOAH app / HazardHunterPH** — street-level hazard risk maps. No confirmed offline mode.
- **Project NOAH (government, DOST/UP Resilience Institute)** — AI flood forecasting, delivers via SMS/app/social/web.
- **Bridgefy / Meshtastic (Light of Hope PH field tests)** — offline Bluetooth/LoRa mesh messaging, but generic transport, not integrated into an alert + evacuation + sensor pipeline.
- **Open Water Level / LevelWAN** — open-source low-cost water-level sensor hardware, research-grade, not connected to citizen-facing alerting.

This product's differentiation: a smart multi-channel delivery fallback (not just caching), and crowdsourced water-level reporting as a software-only substitute for physical sensor hardware — both fully buildable without hardware or a native app, closing gaps the above systems leave open.

### Scope — Phase 1 (this PRD)

Software-only prototype. No physical hardware. Web-based, installable Progressive Web App (PWA), not a native app.

**In scope:**
1. Citizen-facing offline-capable alert app
2. Pre-authored, per-zone (barangay-level) evacuation instructions
3. Crowdsourced water-level reporting, feeding a threshold-based auto-alert trigger
4. Multi-channel alert delivery: live fetch → SMS fallback → offline cache
5. Data model designed so the Authority Dashboard and a future real sensor-hardware feed can plug into the same tables later, without rework

**Out of scope (explicit roadmap, not built this phase):**
- Phone-to-phone Bluetooth mesh relay (requires a native app wrapper; browsers can't run background Bluetooth relay via Web Bluetooth)
- Physical water-level sensor hardware
- Authority Dashboard (separate sub-project, later)
- Dynamic routing engine for evacuation paths (zones use static pre-authored routes, not live routing)

### Target Users

- Residents of flood- and typhoon-prone barangays
- Local Disaster Risk Reduction and Management Offices (DRRMOs) — as future consumers via the Authority Dashboard sub-project

### Core Features (Phase 1)

**1. Offline-first alert display** — A PWA with a service worker pre-caches the latest known alert and the user's zone's evacuation instructions while the device has connectivity. If connectivity drops, the app continues showing this cached data rather than failing.

**2. Multi-channel alert delivery** — Delivery is attempted in priority order: (1) live fetch over internet/data, (2) SMS fallback via PhilSMS API when data/internet is unreachable but cell service still carries SMS, (3) locally cached data when no channel is reachable at all. This is a real fallback that can deliver a *new* alert during the outage itself, not just pre-storm caching.

**3. Pre-authored, per-zone evacuation instructions** — Each zone has a static, pre-authored evacuation center and route, bundled/cached ahead of time, not computed live.

**4. Crowdsourced water-level reporting** — Residents report water depth against a simple visual reference (ankle/knee/waist/neck-deep, or a local landmark), geotagged and timestamped. Enough reports crossing a threshold in one zone within a time window auto-generates a zone alert.

**5. Zone & hazard maps** — Barangay zone boundaries and evacuation points shown on a map built from static, bundled boundary data, consistent with the offline-first design.

### Data Sources (locked)

| Purpose | Source | Notes |
|---|---|---|
| Weather/typhoon bulletins | [PANaHON](https://panahon.gov.ph/) (DOST-PAGASA official) | Authoritative reference; no confirmed public dev API |
| Weather/typhoon bulletins (dev integration) | [bagyo-api](https://github.com/edwardguevarra/bagyo-api) | Free, keyless REST/JSON. Third-party, unofficial |
| Bulletin parsing/archive | [PAGASA Parser](https://pagasa.chlod.net/) / [bulletin-archive](https://github.com/pagasa-parser/bulletin-archive) | Historical + parsed bulletins |
| Rainfall backup | [NASA GPM IMERG](https://gpm.nasa.gov/data) | Satellite rainfall, 30-min resolution |
| Flood/dam water levels | PAGASA FFWSDO / [ProjectLIGTAS](https://projectligtas.com/flood_monitoring) | No confirmed open third-party API — access gap; crowdsourced reports cover this for now |
| Barangay boundaries / zone maps | [GeoRisk ArcGIS REST (PSA/Barangay)](https://portal.georisk.gov.ph/arcgis/rest/services/PSA/Barangay/MapServer), [philippines-json-maps](https://github.com/faeldon/philippines-json-maps), [philippines-psgc-shapefiles](https://github.com/altcoder/philippines-psgc-shapefiles) | Static — bundled directly into the app |
| SMS delivery | [PhilSMS](https://www.philsms.com/) (primary, ₱0.35/SMS) | REST API, no minimum top-up |
| SMS delivery (backup) | [Semaphore](https://semaphore.co/) (₱0.50/SMS) | Alternative provider |

### Architecture

- **Frontend/App shell:** Next.js (App Router), TypeScript strict, RSC-first, feature-based structure
- **Backend/data:** Supabase — tables for `zones`, `alerts`, `water_level_reports`; Row Level Security; Server Actions for all writes
- **Offline layer:** Service worker cache (pre-cache on visit; cache-first fallback when network unreachable)
- **SMS integration:** Server-side integration with PhilSMS API, triggered when the live-fetch channel is confirmed unreachable
- **Styling:** Tailwind + shadcn/ui

### Data Flow

1. Resident opens app while online → fetches current alert + zone's evacuation instructions from Supabase; service worker caches it.
2. Connectivity drops → app serves cached alert/zone data; UI marks it "last known, may be outdated."
3. A new alert is issued → delivery attempted live first, SMS fallback second.
4. Resident submits a water-level report → written to `water_level_reports` → threshold engine evaluates recent reports per zone → auto-creates an `alerts` row if threshold crossed.

### Non-Functional Requirements

- Must run acceptably on low-end Android devices common in flood-prone areas
- Must be installable as a PWA for reliable offline cache behavior
- SMS fallback must degrade gracefully if the provider is unreachable (queue/retry)

### Error Handling

- Stale cached data is visually flagged, never presented as live without qualification
- Crowdsourced reports include geofence validation and per-device rate limiting
- SMS delivery failures are logged and retried against the backup provider

### Testing Approach

- Unit tests for the threshold-trigger engine
- Integration test simulating offline mode (service worker cache-first behavior)
- Manual QA: airplane-mode device test

### Roadmap (explicitly out of Phase 1)

- Phone-to-phone Bluetooth mesh relay (native app required)
- Real water-level sensor hardware integration (schema already supports it)
- Authority Dashboard sub-project

### Open Risks

- PAGASA FFWSDO / official dam water-level API access unresolved
- bagyo-api is an unofficial third-party scraper — fine for a prototype, pursue an official relationship for production
- SMS cost scales with alert volume and subscriber count
