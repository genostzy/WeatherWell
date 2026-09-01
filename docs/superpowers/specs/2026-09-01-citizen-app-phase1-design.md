# WeatherWell — PRD (Citizen App)

*(Challenge: Climate Resilience and Hydrometeorological Disaster Management)*

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
- **MyShake / FEMA WEA** (international reference) — both validate the core patterns used here: MyShake turns phones into distributed sensors (we do the same with crowd water-level reports instead of seismometer data), and WEA-style systems push proactively rather than waiting for the user to check an app (we adopt the same push-first approach below).

This product's differentiation: a smart multi-channel delivery fallback (not just caching), and crowdsourced water-level reporting as a software-only substitute for physical sensor hardware — both fully buildable without hardware or a native app, closing gaps the above systems leave open.

## Governance & Stakeholders

Not previously defined — stated explicitly here since the system has no automated "owner" for its content.

| Stakeholder | Role |
|---|---|
| **Residents** | End users; also crowdsourced data contributors via water-level reports |
| **Barangay/City DRRMO officers** | Authoritative owners of evacuation-zone content; become manual alert issuers/moderators once the Authority Dashboard sub-project ships |
| **Dev team (this project)** | System administrator through the phases below: hosts infrastructure (Vercel/Supabase), curates initial zone/evacuation data from public sources, manages the SMS gateway account |
| **PAGASA / national agencies** | Indirect stakeholder — data source only, not a system user |
| **PhilSMS** | Infrastructure vendor dependency |

Until the Authority Dashboard sub-project exists, this system is **dev-curated, not officially operated** — the dev team stands in for the DRRMO role.

## Scope — Citizen App

Software-only prototype. No physical hardware. Web-based, installable Progressive Web App (PWA), not a native app. **Pilot scope:** launches supporting a single pilot barangay for this challenge (architecture supports unlimited zones without rework).

**In scope:**
1. Citizen-facing offline-capable alert app
2. Pre-authored, per-zone (barangay-level) evacuation instructions
3. Crowdsourced water-level reporting, feeding a threshold-based auto-alert trigger
4. Multi-channel alert delivery: push notification → SMS fallback → offline cache
5. Data model designed so the Authority Dashboard and a future real sensor-hardware feed can plug into the same tables later, without rework

**Out of scope (explicit roadmap, not built this phase):**
- Phone-to-phone Bluetooth mesh relay (requires a native app; browsers can't run background Bluetooth relay via Web Bluetooth)
- Physical water-level sensor hardware
- Authority Dashboard (separate sub-project, later)
- Dynamic routing engine for evacuation paths (zones use static pre-authored routes, not live routing)

## Target Users

- Residents of flood- and typhoon-prone barangays
- Local Disaster Risk Reduction and Management Offices (DRRMOs) — as future consumers via the Authority Dashboard sub-project

## Design Language & Crisis UX

**Visual system: shadcn/ui, High-Contrast Utility-First aesthetic.**

- **Dark-mode-default**, not just supported — OLED dark screens cut power draw significantly at typical brightness, and this is the one app category where battery survival during an outage is a real design constraint, not a preference.
- **Severity color system is the entire visual language**, not just alert badges: Yellow / Orange / Red / Evacuate map consistently across alert banners, the depth-reference visual (below), zone map shading, and button states. One color grammar, no separate decorative palette.
- **No decorative chrome** — flat shadcn components (Button, Card, Alert, Badge) in their plain, high-contrast variants; thick borders over soft shadows (visible in direct sunlight); system font stack only, no custom webfonts (also serves the low-bandwidth requirement).
- **Progressive disclosure** — a stressed user sees only the next needed action (e.g., "Evacuate now → [Route]"), not a full dashboard. Detail is available on drill-down, never required up front.
- **Large targets, minimal text** — buttons and tap targets sized for one-handed, injured, or shaking-hand use; instructions in short plain-language fragments, not paragraphs.
- Designs should be checked under dim light and at arm's length, not just in a bright design tool.

**Depth-reference visual (replaces plain text labels):** an adult reference silhouette and a child reference silhouette side by side, with a rising water-fill line marking the reported depth, colored through the same Yellow→Orange→Red→Evacuate scale. Two figures, not one, because the same water depth that's manageable for an adult can already be dangerous for a child — this is informational, not dramatized (no distress imagery). Pets get a separate small evacuation-checklist reminder elsewhere, not folded into this visual.

## Core Features

### 1. Offline-first alert display
A PWA with a service worker pre-caches the latest known alert and the user's zone's evacuation instructions while the device has connectivity. If connectivity drops, the app continues showing this cached data rather than failing.

### 2. Multi-channel alert delivery
Delivery is attempted in priority order:
1. **Push notification** via the Web Push API — proactive, reaches the user without opening the app, as long as the device has any connectivity when the push fires
2. SMS fallback via PhilSMS API, when push/data is unreachable but the cell network still carries SMS
3. Locally cached data, when no channel is reachable at all

### 3. Pre-authored, per-zone evacuation instructions
Each zone (barangay or defined sub-zone) has a static, pre-authored evacuation center and route (e.g., "Zone 3 → evacuate to San Isidro Elementary via Rizal St."), authored ahead of time and bundled/cached — not computed live.

### 4. Crowdsourced water-level reporting
Residents report water depth using the depth-reference visual (dry/ankle/knee/waist/neck), geotagged and timestamped. Enough reports crossing a threshold in one zone within a time window auto-generates a zone alert. Reports made offline queue via the Background Sync API and send automatically once connectivity returns.

### 5. Zone & hazard maps
Barangay zone boundaries and evacuation points are shown on a map, built from static, bundled boundary data, consistent with the offline-first design.

### 6. Zone onboarding
First-time setup: GPS auto-detects the resident's likely zone, with a manual barangay picker as fallback.

### 7. One-tap emergency hotline
A persistent, always-visible call button to the barangay/DRRMO emergency hotline, independent of app connectivity state.

## Data Trust & Anti-Abuse

Crowdsourced water-level reports are the biggest fake-data risk surface (spam, panic-triggering false reports, downplayed reports, spoofed location). Layered defense, no single point of failure:

1. **Geofence check** — report must carry device GPS falling inside the claimed zone's boundary (checked against bundled zone polygon data). Outside-zone or missing-location reports are rejected or heavily downweighted.
2. **Rate limiting** — one report per device per short window (e.g. 10 minutes), preventing flood-spam from a single source.
3. **Multi-report threshold** — an alert requires several independent, agreeing reports in the same zone within a tight time window; no single report can trigger an alert alone.
4. **Outlier downweighting** — a report that disagrees sharply with nearby reports is discounted rather than trusted outright; clusters of agreement carry more weight than any lone report.
5. **Lightweight identity** — reporter phone number verified once via SMS OTP (not full account signup), raising the cost of abuse above free-and-anonymous.
6. **Reputation scoring** — devices whose past reports matched verified outcomes (official bulletins, other confirming reports) count more over time; devices with a poor track record count less.
7. **Human override** — auto-triggered alerts are a fast first response, not final word. Once the Authority Dashboard sub-project exists, a DRRMO officer can confirm, downgrade, or cancel any auto-triggered alert.
8. **Audit trail** — every report is retained with timestamp, location, and device id, enabling later review and threshold/weight tuning.
9. **False-alarm downgrade UX** — if an auto-triggered alert is later downgraded, the app shows this transparently rather than silently removing it, so trust in the system doesn't erode.

*Layers 1–3 ship in Phase 3 (v1); layers 5–6 ship in the Final Phase (mvp) — see Implementation Phases below.*

## Accessibility & Inclusion

Target users are a broad, often vulnerable population under disaster stress — accessibility isn't cosmetic here, it determines whether an alert actually reaches and is understood by the person who needs it.

1. **Language** — Filipino (Tagalog) and English as the baseline; zone data model stores instruction text per-language so regional languages (Cebuano, Ilocano, etc.) can be added without rework.
2. **WCAG AA baseline** — sufficient color contrast, full keyboard navigation, screen-reader labels on all interactive elements, minimum touch target size for stressed or wet-handed use.
3. **Low-literacy design** — evacuation instructions paired with icon/pictogram cues and the depth-reference visual, not text-only.
4. **Audio alerts** — critical alerts can optionally be read aloud (device text-to-speech); text-based delivery (SMS, on-screen) stays primary too, so deaf/hard-of-hearing users aren't left dependent on audio.
5. **Enrollment without ever opening the app** — non-smartphone or first-time users enroll via a simple SMS opt-in keyword or barangay-level bulk enrollment by the DRRMO.

## Privacy & Consent

The app collects location (geofencing, zone detection) and phone numbers (SMS enrollment, OTP) — both are personal data under the **Philippines Data Privacy Act of 2012 (RA 10173)**, requiring informed, explicit consent and a transparent stated purpose before collection. Non-compliance carries real National Privacy Commission fines (up to ₱5M per violation for grave cases).

- A plain-language consent notice is shown before the first location or phone-number request: what's collected, why, and how it's used.
- Location is used only for geofence validation and zone auto-detection, never stored beyond what's needed for report validation.
- Phone numbers are stored hashed, never in plaintext, used only for OTP verification and SMS delivery.
- Consent and data-handling notice ships from Phase 1 (hi-fi), not deferred.

## Power & Battery Considerations

During an extended outage there's no way to recharge — battery is a survival resource here, not a convenience metric.

- Dark-mode-default UI.
- Minimal background activity: no polling loops; service worker wakes only on push events or user action.
- Background Sync queues writes instead of retrying on a timer.

## Data Sources (locked)

| Purpose | Source | Notes |
|---|---|---|
| Weather/typhoon bulletins | [PANaHON](https://panahon.gov.ph/) (DOST-PAGASA official) | Authoritative reference; no confirmed public dev API |
| Weather/typhoon bulletins (dev integration) | [bagyo-api](https://github.com/edwardguevarra/bagyo-api) | Free, keyless REST/JSON. Third-party, unofficial — not affiliated with PAGASA/DOST; risk of breakage if PAGASA's site changes |
| Bulletin parsing/archive | [PAGASA Parser](https://pagasa.chlod.net/) / [bulletin-archive](https://github.com/pagasa-parser/bulletin-archive) | Historical + parsed bulletins |
| Rainfall backup | [NASA GPM IMERG](https://gpm.nasa.gov/data) | Satellite rainfall, 30-min resolution, fills gaps with no local PAGASA station |
| Flood/dam water levels | PAGASA FFWSDO / [ProjectLIGTAS](https://projectligtas.com/flood_monitoring) | No confirmed open third-party API found — access gap. Crowdsourced reports are the primary real-time water-level signal for this phase |
| Barangay boundaries / zone maps | [GeoRisk ArcGIS REST (PSA/Barangay)](https://portal.georisk.gov.ph/arcgis/rest/services/PSA/Barangay/MapServer), [philippines-json-maps](https://github.com/faeldon/philippines-json-maps), [philippines-psgc-shapefiles](https://github.com/altcoder/philippines-psgc-shapefiles) | Static, rarely-changing data — bundled directly into the app |
| SMS delivery | [PhilSMS](https://www.philsms.com/) (primary, ₱0.35/SMS) | REST API, no minimum top-up |
| SMS delivery (backup provider) | [Semaphore](https://semaphore.co/) (₱0.50/SMS) | Alternative if PhilSMS has an outage |

## Architecture

- **Frontend/App shell:** Next.js (App Router), TypeScript strict, RSC-first, feature-based structure
- **UI:** shadcn/ui + Tailwind, High-Contrast Utility-First theme, dark-mode-default
- **Backend/data:** Supabase — tables for `zones`, `alerts`, `water_level_reports`, `push_subscriptions`; Row Level Security; Server Actions for all writes
- **Offline layer:** Service worker cache (cache-first for `zones`/evacuation data, long TTL; network-first with cache fallback for `alerts`); Background Sync for offline report submission
- **Push:** Web Push API (VAPID keys), service worker handles push events and displays notifications even when the app isn't open
- **SMS integration:** Server-side integration with PhilSMS API, triggered when push delivery is unconfirmed

**Schema (illustrative):**
- `zones`: id, psgc_barangay_code, name, evacuation_center_name, evacuation_route_text (jsonb, per-language)
- `alerts`: id, zone_id, severity (yellow/orange/red/evacuate), message (jsonb per-language), source (manual/auto_crowdsourced), issued_at, expires_at, is_active
- `water_level_reports`: id, zone_id, reporter_phone_hash, device_id, depth_level (dry/ankle/knee/waist/neck), lat/lng, trust_weight, is_outlier, reported_at
- `push_subscriptions`: id, zone_id, device_id, endpoint, keys (jsonb)

**Auto-trigger rule (illustrative, tunable):** ≥3 reports from different devices, same zone, within 30 minutes, average depth ≥ `waist` → auto-creates a Red-severity alert.

## Data Flow

1. Resident installs the app, grants (or declines) location/notification permission after seeing the consent notice, selects or auto-detects their zone.
2. A new alert is issued (manually by an authority in a later phase, or auto-triggered by the threshold engine) → push notification attempted first, SMS fallback second if push delivery isn't confirmed.
3. Connectivity is fully down → app serves cached alert/zone data; UI marks it "last known, may be outdated."
4. Resident submits a water-level report → if offline, queued via Background Sync; once sent, written to `water_level_reports` → threshold engine evaluates recent reports per zone → auto-creates an `alerts` row if threshold crossed.

## Non-Functional Requirements

- Must run acceptably on low-end Android devices common in rural/flood-prone areas
- Must be installable as a PWA for reliable offline cache behavior
- SMS fallback must degrade gracefully if the provider is unreachable (queue/retry)
- Must comply with RA 10173 consent requirements before any location/phone collection
- UI must remain legible in direct sunlight and in the dark, without relying on brightness alone

## Error Handling

- Stale cached data is visually flagged, never presented as live without qualification
- Crowdsourced reports go through the full Data Trust & Anti-Abuse pipeline above before affecting any alert
- SMS delivery failures are logged and retried against the backup provider
- Downgraded/cancelled auto-alerts are shown transparently, not silently removed

## Testing Approach

- Unit tests for the threshold-trigger engine
- Integration test simulating offline mode (service worker cache-first behavior) and Background Sync report queuing
- Manual QA: airplane-mode device test, sunlight/dim-light legibility check
- Field pilot with the single pilot barangay before considering a wider rollout (Final Phase)

## Implementation Phases

Mapped onto the repo's branch workflow — each phase has a concrete build plan.

**Phase 1 (`hi-fi`)** — UI only, no backend.
- Build: alert screen, evacuation screen, water-level report form (with the depth-reference visual), zone map, consent notice — all on mock data.
- Plan: build components in shadcn/ui high-contrast theme → wire mock data fixtures → deploy Vercel preview → accessibility pass.
- Exit criteria: full mock click-through, preview link ready for submission review.

**Phase 2 (`v0`)** — Real data, real offline.
- Build: Supabase schema + RLS, Server Actions, service worker caching, installable PWA manifest.
- Plan: write migrations → wire Server Actions → implement service worker + Background Sync → seed pilot barangay data → airplane-mode QA.
- Exit criteria: app works fully offline on real seeded data after first online visit.

**Phase 3 (`v1`)** — Core mechanism goes live.
- Build: threshold engine, PhilSMS fallback integration, Web Push subscription + delivery, the 3 cheap anti-abuse layers.
- Plan: implement + unit-test threshold logic → integrate Push + PhilSMS with fallback ordering → geofence/rate-limit checks → integration test of push→SMS→cache fallback path.
- Exit criteria: simulated crowd reports correctly auto-trigger an alert and deliver via push, falling back to SMS in a test environment.

**Final Phase (`mvp`)** — Trust and inclusion polish that needs real usage to tune well.
- Build: reputation scoring, outlier downweighting, SMS OTP identity, audio/TTS alerts, SMS opt-in enrollment, one-tap emergency hotline, full accessibility audit.
- Plan: reputation model → OTP flow → TTS → SMS opt-in handler → hotline integration → full WCAG audit → field pilot → end-to-end QA → prep for `main` merge.
- Exit criteria: full feature set working together, audit passed, pilot feedback incorporated, submission-ready.

## Future Roadmap (beyond this project)

- Phone-to-phone Bluetooth mesh relay (native app required)
- Real water-level sensor hardware integration (schema already supports it)
- Authority Dashboard sub-project

## Open Risks

- PAGASA FFWSDO / official dam water-level API access is unresolved
- bagyo-api is an unofficial third-party scraper — acceptable for a prototype, pursue an official PAGASA/PANaHON relationship for production
- SMS cost scales with alert volume and subscriber count
- Web Push delivery isn't guaranteed (device/browser dependent) — SMS fallback is required, not optional
- RA 10173 compliance is stated by design here but not legally reviewed — recommend actual legal review before any real deployment beyond the pilot
