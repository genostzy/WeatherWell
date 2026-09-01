# Climate Resilience and Hydrometeorological Disaster Management — PRD (Phase 1: Citizen App)

## Background

The Philippines experiences an average of twenty tropical cyclones a year. When severe typhoons strike, infrastructure collapse routinely severs internet and cellular connections, cutting off centralized, cloud-based early warning systems precisely when communities need them most. Local communities also struggle to translate broad national weather data into actionable, street-level evacuation protocols, and affordable, localized water-level sensors for real-time flood alerts remain largely unavailable.

## Product Vision

**The neighborhood is both the network and the sensor.** Rather than depending solely on a live connection to a centralized cloud service, the system is designed to keep delivering actionable, street-level guidance through a connectivity outage, and to source local flood conditions from the community itself rather than requiring physical sensor hardware.

## Competitive Landscape (why this isn't a clone)

Existing Philippine systems each solve part of the problem but share a common weakness — all still assume a live connection to deliver anything in real time:

- **ProjectLIGTAS** — live barangay flood map, PAGASA/UP NOAH data aggregation, crowdsourced flood reports. No confirmed offline capability.
- **UP NOAH app / HazardHunterPH** — street-level hazard risk maps. No confirmed offline mode.
- **Project NOAH (government, DOST/UP Resilience Institute)** — AI flood forecasting, delivers via SMS/app/social/web.
- **Bridgefy / Meshtastic (Light of Hope PH field tests)** — offline Bluetooth/LoRa mesh messaging, but generic transport, not integrated into an alert + evacuation + sensor pipeline.
- **Open Water Level / LevelWAN** — open-source low-cost water-level sensor hardware, research-grade, not connected to citizen-facing alerting.

This product's differentiation: a smart multi-channel delivery fallback (not just caching), and crowdsourced water-level reporting as a software-only substitute for physical sensor hardware — both fully buildable without hardware or a native app, closing gaps the above systems leave open.

## Scope — Phase 1 (this PRD)

Software-only prototype. No physical hardware. Web-based, installable Progressive Web App (PWA), not a native app.

**In scope:**
1. Citizen-facing offline-capable alert app
2. Pre-authored, per-zone (barangay-level) evacuation instructions
3. Crowdsourced water-level reporting, feeding a threshold-based auto-alert trigger
4. Multi-channel alert delivery: live fetch → SMS fallback → offline cache
5. Data model designed so the Authority Dashboard and a future real sensor-hardware feed can plug into the same tables later, without rework

**Out of scope (explicit roadmap, not built this phase):**
- Phone-to-phone Bluetooth mesh relay (requires a native app; browsers can't run background Bluetooth relay via Web Bluetooth)
- Physical water-level sensor hardware
- Authority Dashboard (separate sub-project, later)
- Dynamic routing engine for evacuation paths (zones use static pre-authored routes, not live routing)

## Target Users

- Residents of flood- and typhoon-prone barangays
- Local Disaster Risk Reduction and Management Offices (DRRMOs) — as future consumers via the Authority Dashboard sub-project

## Core Features (Phase 1)

### 1. Offline-first alert display
A PWA with a service worker pre-caches the latest known alert and the user's zone's evacuation instructions while the device has connectivity. If connectivity drops, the app continues showing this cached data rather than failing.

### 2. Multi-channel alert delivery
Delivery is attempted in priority order:
1. Live fetch over internet/data, when available
2. SMS fallback via PhilSMS API, when data/internet is unreachable but the cell network still carries SMS (the common real-world pattern in PH typhoon outages — data backhaul fails before voice/SMS does)
3. Locally cached data, when no channel is reachable at all

This is a real fallback, not just pre-storm caching — it can deliver a *new* alert during the outage itself, within the constraints of the cell network still being partially up.

### 3. Pre-authored, per-zone evacuation instructions
Each zone (barangay or defined sub-zone) has a static, pre-authored evacuation center and route (e.g., "Zone 3 → evacuate to San Isidro Elementary via Rizal St."), authored ahead of time and bundled/cached — not computed live.

### 4. Crowdsourced water-level reporting
Residents report water depth against a simple, non-technical visual reference (e.g., ankle/knee/waist/neck-deep, or a locally marked landmark), geotagged and timestamped. When enough reports in one zone cross a defined depth threshold within a time window, the system auto-generates a zone alert — functioning as a distributed, zero-hardware substitute for physical water-level sensors.

### 5. Zone & hazard maps
Barangay zone boundaries and evacuation points are shown on a map, built from static, bundled boundary data (not a live geospatial API), consistent with the offline-first design.

## Data Trust & Anti-Abuse

Crowdsourced water-level reports are the biggest fake-data risk surface (spam, panic-triggering false reports, downplayed reports, spoofed location). Layered defense, no single point of failure:

1. **Geofence check** — report must carry device GPS falling inside the claimed zone's boundary (checked against bundled zone polygon data). Outside-zone or missing-location reports are rejected or heavily downweighted.
2. **Rate limiting** — one report per device per short window (e.g. 10 minutes), preventing flood-spam from a single source.
3. **Multi-report threshold** — an alert requires several independent, agreeing reports in the same zone within a tight time window; no single report can trigger an alert alone.
4. **Outlier downweighting** — a report that disagrees sharply with nearby reports is discounted rather than trusted outright; clusters of agreement carry more weight than any lone report.
5. **Lightweight identity** — reporter phone number verified once via SMS OTP (not full account signup), raising the cost of abuse above free-and-anonymous.
6. **Reputation scoring** — devices whose past reports matched verified outcomes (official bulletins, other confirming reports) count more over time; devices with a poor track record count less. Self-correcting without manual moderation for most cases.
7. **Human override** — auto-triggered alerts are a fast first response, not final word. Once the Authority Dashboard sub-project exists, a DRRMO officer can confirm, downgrade, or cancel any auto-triggered alert.
8. **Audit trail** — every report is retained with timestamp, location, and device id, enabling later review and threshold/weight tuning.

## Data Sources (locked)

| Purpose | Source | Notes |
|---|---|---|
| Weather/typhoon bulletins | [PANaHON](https://panahon.gov.ph/) (DOST-PAGASA official) | Authoritative reference; no confirmed public dev API |
| Weather/typhoon bulletins (dev integration) | [bagyo-api](https://github.com/edwardguevarra/bagyo-api) | Free, keyless REST/JSON. Third-party, unofficial — not affiliated with PAGASA/DOST; risk of breakage if PAGASA's site changes |
| Bulletin parsing/archive | [PAGASA Parser](https://pagasa.chlod.net/) / [bulletin-archive](https://github.com/pagasa-parser/bulletin-archive) | Historical + parsed bulletins |
| Rainfall backup | [NASA GPM IMERG](https://gpm.nasa.gov/data) | Satellite rainfall, 30-min resolution, fills gaps with no local PAGASA station |
| Flood/dam water levels | PAGASA FFWSDO / [ProjectLIGTAS](https://projectligtas.com/flood_monitoring) | No confirmed open third-party API found — access gap. Crowdsourced reports (Feature 4) are the primary real-time water-level signal for this phase |
| Barangay boundaries / zone maps | [GeoRisk ArcGIS REST (PSA/Barangay)](https://portal.georisk.gov.ph/arcgis/rest/services/PSA/Barangay/MapServer), [philippines-json-maps](https://github.com/faeldon/philippines-json-maps), [philippines-psgc-shapefiles](https://github.com/altcoder/philippines-psgc-shapefiles) | Static, rarely-changing data — bundled directly into the app rather than fetched live, per offline-first design |
| SMS delivery | [PhilSMS](https://www.philsms.com/) (primary, ₱0.35/SMS) | REST API, no minimum top-up |
| SMS delivery (backup provider) | [Semaphore](https://semaphore.co/) (₱0.50/SMS) | Alternative if PhilSMS has an outage |

## Architecture

- **Frontend/App shell:** Next.js (App Router), TypeScript strict, RSC-first, feature-based structure — per established project conventions
- **Backend/data:** Supabase — tables for `zones`, `alerts`, `water_level_reports`; Row Level Security; Server Actions for all writes (per established security conventions)
- **Offline layer:** Service worker cache (pre-cache on visit; cache-first fallback for alert/zone data when network unreachable)
- **SMS integration:** Server-side integration with PhilSMS API, triggered when the live-fetch channel is confirmed unreachable
- **Styling:** Tailwind + shadcn/ui, per established UI conventions

## Data Flow

1. Resident opens app while online → app fetches current alert + their zone's evacuation instructions from Supabase, service worker caches the response.
2. Connectivity drops → app continues serving cached alert/zone data; UI clearly marks data as "last known, may be outdated."
3. A new alert is issued (manually by an authority in a later phase, or auto-triggered by crowdsourced threshold logic in this phase) → delivery attempted live first, SMS fallback second if the app's live channel can't be reached.
4. Resident submits a water-level report (needs at least a partial connection to submit) → written to `water_level_reports` → threshold engine evaluates recent reports per zone → auto-creates an `alerts` row if threshold crossed.

## Non-Functional Requirements

- Must run acceptably on low-end Android devices common in rural/flood-prone areas (avoid heavy JS bundles, optimize for low bandwidth)
- Must be installable as a PWA (add-to-homescreen) for reliable offline cache behavior
- SMS fallback must degrade gracefully if the SMS provider is unreachable (queue/retry, don't fail silently)

## Error Handling

- Stale cached data is visually flagged (timestamp + "may be outdated" indicator), never presented as live without qualification
- Crowdsourced reports go through the full Data Trust & Anti-Abuse pipeline above before affecting any alert
- SMS delivery failures are logged server-side and retried against the backup provider (Semaphore)

## Testing Approach

- Unit tests for the threshold-trigger engine (crowdsourced reports → auto-alert logic)
- Integration test simulating offline mode (service worker cache-first behavior)
- Manual QA: airplane-mode device test to confirm cached alert/evacuation data remains usable

## Roadmap (explicitly out of Phase 1)

- **Phone-to-phone Bluetooth mesh relay** — requires a native app wrapper (e.g., Capacitor); Web Bluetooth can't run background relay. Full-blackout redundancy layer.
- **Real water-level sensor hardware integration** — `water_level_reports`-equivalent table structure designed to accept a hardware feed later without schema rework.
- **Authority Dashboard sub-project** — where alerts get authored/managed and zones get defined; this phase's citizen app reads from the same tables it will later write to.

## Open Risks

- PAGASA FFWSDO / official dam water-level API access is unresolved — no public developer path confirmed. Crowdsourced reporting covers this gap for now.
- bagyo-api is an unofficial third-party scraper — acceptable for a prototype, but a production system should pursue an official PAGASA/PANaHON data relationship.
- SMS cost scales with alert volume and subscriber count — needs monitoring if usage grows.
