# PRD

*Single source of truth for this project. Phase 1 task breakdown: [docs/superpowers/plans/2026-09-01-hi-fi-WeatherWell.md](docs/superpowers/plans/2026-09-01-hi-fi-WeatherWell.md). Concept pitch: [IDEA.md](IDEA.md).*

## WeatherWell — Citizen App

*(Challenge: Climate Resilience and Hydrometeorological Disaster Management)*

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
- **MyShake / FEMA WEA** (international reference) — both validate the core patterns used here: MyShake turns phones into distributed sensors (we do the same with crowd water-level reports instead of seismometer data), and WEA-style systems push proactively rather than waiting for the user to check an app (we adopt the same push-first approach below).

This product's differentiation: a smart multi-channel delivery fallback (not just caching), and crowdsourced water-level reporting as a software-only substitute for physical sensor hardware — both fully buildable without hardware or a native app, closing gaps the above systems leave open.

### Governance & Stakeholders

Not previously defined — stated explicitly here since the system has no automated "owner" for its content.

| Stakeholder | Role |
|---|---|
| **Residents** | End users; also crowdsourced data contributors via water-level reports |
| **Barangay/City DRRMO officers** | Authoritative owners of evacuation-zone content; become manual alert issuers/moderators once the Authority Dashboard sub-project ships |
| **Dev team (this project)** | System administrator through the phases below: hosts infrastructure (Vercel/Supabase), curates initial zone/evacuation data from public sources, manages the SMS gateway account |
| **PAGASA / national agencies** | Indirect stakeholder — data source only, not a system user |
| **PhilSMS** | Infrastructure vendor dependency |

Until the Authority Dashboard sub-project exists, this system is **dev-curated, not officially operated** — the dev team stands in for the DRRMO role. This should be stated plainly wherever the system is presented, so it's clear this is a prototype standing in for a role barangay officials would eventually own.

### Scope — Citizen App

Software-only prototype. No physical hardware. Web-based, installable Progressive Web App (PWA), not a native app.

**Pilot scope:** one real barangay is the deployment target for this challenge. The app itself is multi-zone from Phase 1 — the hi-fi build carries three mock barangays so zone selection, zone listing, and the "no active alert" state are all exercisable, and the architecture supports unlimited zones without rework. One barangay is the *pilot*, not the *capacity*.

**In scope:**
1. Citizen-facing offline-capable alert app
2. Pre-authored, per-zone (barangay-level) evacuation instructions
3. Crowdsourced water-level reporting, feeding a threshold-based auto-alert trigger
4. Multi-channel alert delivery: push notification → SMS fallback → offline cache
5. Data model designed so the Authority Dashboard and a future real sensor-hardware feed can plug into the same tables later, without rework

**Out of scope (explicit roadmap, not built this phase):**
- Phone-to-phone Bluetooth mesh relay (requires a native app wrapper; browsers can't run background Bluetooth relay via Web Bluetooth)
- Physical water-level sensor hardware
- Authority Dashboard (separate sub-project, later)
- Dynamic routing engine for evacuation paths (zones use static pre-authored routes, not live routing)

### Target Users

- Residents of flood- and typhoon-prone barangays
- Local Disaster Risk Reduction and Management Offices (DRRMOs) — as future consumers via the Authority Dashboard sub-project

### Design Language & Crisis UX

**Visual system: shadcn/ui, High-Contrast Utility-First aesthetic.**

- **Dark-mode-default**, not just supported — OLED dark screens cut power draw significantly at typical brightness, and this is the one app category where battery survival during an outage is a real design constraint, not a preference.
- **Severity color system is the entire visual language**, not just alert badges: Yellow / Orange / Red / Evacuate map consistently across alert banners, the depth-reference visual (below), zone map shading, and button states. One color grammar, no separate decorative palette.
- **No decorative chrome** — flat shadcn components (Button, Card, Alert, Badge) in their plain, high-contrast variants; thick borders over soft shadows (visible in direct sunlight); system font stack only, no custom webfonts (also serves the low-bandwidth requirement).
- **Progressive disclosure** — a stressed user sees only the next needed action (e.g., "Evacuate now → [Route]"), not a full dashboard. Detail is available on drill-down, never required up front.
- **Large targets, minimal text** — buttons and tap targets sized for one-handed, injured, or shaking-hand use; instructions in short plain-language fragments, not paragraphs.
- Designs should be checked under dim light and at arm's length, not just in a bright design tool — this is a documented gap in most emergency-app design processes.

**Depth-reference visual (replaces plain text labels):** an adult reference silhouette and a child reference silhouette standing on a **shared ground line under a single shared waterline**, colored through the same Yellow→Orange→Red→Evacuate scale. The child is drawn **physically shorter** (110cm vs 170cm), and the water is drawn at one absolute height across both figures — so a depth that reaches an adult's chest visibly closes over a child's head. That asymmetry is the entire reason two figures exist; drawing them the same height would destroy the message. Informational, not dramatized — no distress imagery. Pets get a separate small evacuation-checklist reminder elsewhere, not folded into this visual.

### Severity & Depth Reference (decided values)

These are implemented values, not proposals — the UI, the auto-trigger rule, and the accessibility tests all read from them.

| Severity | Label shown | Hex | Text on top | Contrast |
|---|---|---|---|---|
| `yellow` | Advisory | `#eab308` | black | 10.9:1 |
| `orange` | Watch | `#f97316` | black | 7.5:1 |
| `red` | Warning | `#dc2626` | white | 4.8:1 |
| `evacuate` | Evacuate Now | `#7f1d1d` | white | 10.0:1 |

All four clear WCAG AA (≥4.5:1); `red` is the tightest. Contrast is asserted numerically in the test suite, so changing a hex without rechecking fails the build.

| Depth level | Label | Approx. depth | Maps to severity |
|---|---|---|---|
| `dry` | Dry | 0 cm | yellow |
| `ankle` | Ankle-deep | 15 cm | yellow |
| `knee` | Knee-deep | 45 cm | orange |
| `waist` | Waist-deep | 90 cm | red |
| `neck` | Neck-deep | 150 cm | evacuate |

Reference figure heights: adult 170 cm, child 110 cm. At `neck` (150 cm) the child is fully submerged while the adult is not — the case the two-figure visual exists to communicate.

### Core Features

**1. Offline-first alert display** — A PWA with a service worker pre-caches the latest known alert and the user's zone's evacuation instructions while the device has connectivity. If connectivity drops, the app continues showing this cached data rather than failing.

**2. Multi-channel alert delivery** — Delivery is attempted in priority order: (1) **push notification** via the Web Push API (proactive — reaches the user without them opening the app, as long as the device has any connectivity when the push fires), (2) SMS fallback via PhilSMS API when push/data is unreachable but cell service still carries SMS, (3) locally cached data when no channel is reachable at all.

**3. Pre-authored, per-zone evacuation instructions** — Each zone has a static, pre-authored evacuation center and route, bundled/cached ahead of time, not computed live.

**4. Crowdsourced water-level reporting** — Residents report water depth using the depth-reference visual (dry/ankle/knee/waist/neck), geotagged and timestamped. Enough reports crossing a threshold in one zone within a time window auto-generates a zone alert. Reports made offline queue via the Background Sync API and send automatically once connectivity returns, instead of failing outright.

**5. Zone & hazard maps** — Barangay zone boundaries and evacuation points shown on a map built from static, bundled boundary data, consistent with the offline-first design.

**6. Zone onboarding** — First-time setup: GPS auto-detects the resident's likely zone, with a manual barangay picker as fallback (GPS denied, indoors, or wrong detection).

**7. One-tap emergency hotline** — A persistent, always-visible call button to the barangay/DRRMO emergency hotline, independent of app connectivity state.

### Data Trust & Anti-Abuse

Crowdsourced water-level reports are the biggest fake-data risk surface (spam, panic-triggering false reports, downplayed reports, spoofed location). Layered defense, no single point of failure:

1. **Geofence check** — report must carry device GPS falling inside the claimed zone's boundary (checked against bundled zone polygon data). Outside-zone or missing-location reports are rejected or heavily downweighted.
2. **Rate limiting** — one report per device per short window (e.g. 10 minutes), preventing flood-spam from a single source.
3. **Multi-report threshold** — an alert requires several independent, agreeing reports in the same zone within a tight time window; no single report can trigger an alert alone.
4. **Outlier downweighting** — a report that disagrees sharply with nearby reports is discounted rather than trusted outright; clusters of agreement carry more weight than any lone report.
5. **Lightweight identity** — reporter phone number verified once via SMS OTP (not full account signup), raising the cost of abuse above free-and-anonymous.
6. **Reputation scoring** — devices whose past reports matched verified outcomes (official bulletins, other confirming reports) count more over time; devices with a poor track record count less. Self-correcting without manual moderation for most cases.
7. **Human override** — auto-triggered alerts are a fast first response, not final word. Once the Authority Dashboard sub-project exists, a DRRMO officer can confirm, downgrade, or cancel any auto-triggered alert.
8. **Audit trail** — every report is retained with timestamp, location, and device id, enabling later review and threshold/weight tuning.
9. **False-alarm downgrade UX** — if an auto-triggered alert is later downgraded (proven false or overstated), the app shows this transparently ("Alert downgraded — water levels below threshold") rather than silently removing it, so trust in the system doesn't erode through unexplained disappearing alerts.

*Layer 1–3 ship in Phase 3 (v1); layers 5–6 ship in the Final Phase (mvp) — see Implementation Phases below.*

### Accessibility & Inclusion

Target users are a broad, often vulnerable population under disaster stress — accessibility isn't cosmetic here, it determines whether an alert actually reaches and is understood by the person who needs it.

1. **Language** — Filipino (Tagalog) and English as the baseline; zone data model stores instruction text per-language so regional languages (Cebuano, Ilocano, etc.) can be added without rework.
2. **WCAG AA baseline** — sufficient color contrast (critical for outdoor/low-light phone use — also reinforced by the high-contrast design language above), full keyboard navigation, screen-reader labels on all interactive elements, minimum touch target size for stressed or wet-handed use.
3. **Low-literacy design** — evacuation instructions paired with icon/pictogram cues and the depth-reference visual, not text-only, so meaning survives for residents who read poorly or not at all.
4. **Audio alerts** — critical alerts can optionally be read aloud (device text-to-speech), supporting visually impaired and low-literacy users; text-based delivery (SMS, on-screen) stays primary too, so deaf/hard-of-hearing users aren't left dependent on audio.
5. **Enrollment without ever opening the app** — SMS fallback needs a phone number on file; non-smartphone or first-time users enroll via a simple SMS opt-in keyword (e.g., text "JOIN [ZONE]" to a shortcode) or barangay-level bulk enrollment by the DRRMO, not solely through the PWA.

### Privacy & Consent

The app collects location (geofencing, zone detection) and phone numbers (SMS enrollment, OTP) — both are personal data under the **Philippines Data Privacy Act of 2012 (RA 10173)**, requiring informed, explicit consent and a transparent stated purpose before collection. Non-compliance carries real National Privacy Commission fines (up to ₱5M per violation for grave cases).

- A plain-language consent notice is shown before the first location or phone-number request: what's collected, why, and how it's used — no pre-ticked boxes, no bundling with unrelated permissions.
- Location is used only for geofence validation and zone auto-detection, never stored beyond what's needed for report validation.
- Phone numbers are stored hashed, never in plaintext, and used only for OTP verification and SMS delivery.
- Consent and data-handling notice ships from Phase 1 (hi-fi) as part of the UI, not deferred to a later phase.

### Power & Battery Considerations

During an extended outage there's no way to recharge — battery is a survival resource, not a convenience metric, which makes this a real design constraint unique to this app's premise.

- Dark-mode-default UI (see Design Language above).
- Minimal background activity: no polling loops; service worker wakes only on push events or user action.
- Background Sync queues writes instead of retrying on a timer.

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
- **UI:** shadcn/ui + Tailwind, High-Contrast Utility-First theme, dark-mode-default
- **Backend/data:** Supabase — tables for `zones`, `alerts`, `water_level_reports`, `push_subscriptions`; Row Level Security; Server Actions for all writes
- **Offline layer:** Service worker cache (cache-first for `zones`/evacuation data, long TTL; network-first with cache fallback for `alerts`); Background Sync for offline report submission
- **Push:** Web Push API (VAPID keys), service worker handles push events and displays notifications even when the app isn't open
- **SMS integration:** Server-side integration with PhilSMS API, triggered when push delivery is unconfirmed
- **Depth reference:** severity/depth level enum shared between the report form, the map, and alert styling — one source of truth, not duplicated logic

**Schema (illustrative):**
- `zones`: id, psgc_barangay_code, name, evacuation_center_name, evacuation_route_text (jsonb, per-language)
- `alerts`: id, zone_id, severity (yellow/orange/red/evacuate), message (jsonb per-language), source (manual/auto_crowdsourced), issued_at, expires_at, is_active
- `water_level_reports`: id, zone_id, reporter_phone_hash, device_id, depth_level (dry/ankle/knee/waist/neck), lat/lng, trust_weight, is_outlier, reported_at
- `push_subscriptions`: id, zone_id, device_id, endpoint, keys (jsonb)

**Auto-trigger rule (illustrative, tunable):** ≥3 reports from different devices, same zone, within 30 minutes, average depth ≥ `waist` → auto-creates a Red-severity alert.

### Data Flow

1. Resident installs the app, grants (or declines) location/notification permission after seeing the consent notice, selects or auto-detects their zone.
2. A new alert is issued (manually by an authority in a later phase, or auto-triggered by the threshold engine) → push notification attempted first, SMS fallback second if push delivery isn't confirmed.
3. Connectivity is fully down → app serves cached alert/zone data; UI marks it "last known, may be outdated."
4. Resident submits a water-level report → if offline, queued via Background Sync; once sent, written to `water_level_reports` → threshold engine evaluates recent reports per zone → auto-creates an `alerts` row if threshold crossed.

### Non-Functional Requirements

- Must run acceptably on low-end Android devices common in flood-prone areas
- Must be installable as a PWA for reliable offline cache behavior
- SMS fallback must degrade gracefully if the provider is unreachable (queue/retry)
- Must comply with RA 10173 consent requirements before any location/phone collection
- UI must remain legible in direct sunlight and in the dark, without relying on brightness alone

### Error Handling

- Stale cached data is visually flagged, never presented as live without qualification
- Crowdsourced reports go through the full Data Trust & Anti-Abuse pipeline above before affecting any alert
- SMS delivery failures are logged and retried against the backup provider
- Downgraded/cancelled auto-alerts are shown transparently, not silently removed

### Testing Approach

- Unit tests for the threshold-trigger engine
- Integration test simulating offline mode (service worker cache-first behavior) and Background Sync report queuing
- Manual QA: airplane-mode device test, sunlight/dim-light legibility check
- Field pilot with the single pilot barangay before considering a wider rollout (Final Phase)

### Success Metrics

How to tell whether this actually works, rather than merely ships. Targets are initial hypotheses to validate in the pilot, not guarantees.

**Primary — does the alert reach people when it matters?**

| Metric | Definition | Target |
|---|---|---|
| Alert reach | Enrolled residents in a zone who received an alert by any channel (push, SMS, or opened the app and saw cached state) ÷ enrolled residents in that zone | ≥ 90% |
| Outage reach | Same, measured only for alerts issued while the resident's device had no data connection | ≥ 70% (this is the number the whole product exists to move) |
| Time to delivery | Alert created → first channel confirms delivery | < 60s median, push path |
| Offline usefulness | Sessions opened with no connectivity that still showed a zone's evacuation instructions | 100% (any failure is a defect, not a metric) |

**Secondary — is the crowdsourced sensor trustworthy?**

| Metric | Definition | Target |
|---|---|---|
| Report validity | Reports passing geofence + rate-limit checks ÷ total submitted | ≥ 85% |
| False-alarm rate | Auto-triggered alerts later downgraded or cancelled ÷ all auto-triggered alerts | ≤ 10% |
| Corroboration depth | Median independent reports behind each auto-triggered alert | ≥ 3 (the threshold floor) |
| Contribution rate | Enrolled residents submitting ≥ 1 report during a flood event | ≥ 15% |

**Adoption — pilot barangay**

| Metric | Definition | Target |
|---|---|---|
| Enrollment | Households enrolled (app or SMS opt-in) ÷ households in the pilot barangay | ≥ 30% |
| Retention through an event | Enrolled users still enrolled 30 days after a flood event | ≥ 80% |

Phase 1 (`hi-fi`) cannot move any of these — it has no backend and no users. Its own exit bar is the qualitative one already stated: a complete first-run click-through and a passing accessibility audit.

### Assumptions & Dependencies

Stated explicitly because the design leans on them, and one of them is load-bearing.

1. **SMS survives when mobile data does not.** *(Load-bearing — validate before relying on it.)* The entire fallback ordering assumes that during PH typhoon outages, data backhaul degrades before voice/SMS. This is the common reported pattern and is why PAGASA and NDRRMC lean on SMS, but it is not universally true — a downed tower kills both. If it fails to hold, the fallback chain collapses to "cached data only" and the case for phone-to-phone mesh relay (currently roadmap) becomes the primary answer instead of a nice-to-have.
2. **Residents have a smartphone with a modern browser.** Those who don't are served only by the SMS path, which is why SMS opt-in enrollment exists as a non-app entry point.
3. **Web Push is not guaranteed.** Delivery depends on device, browser, and OS battery policy — iOS in particular only supports Web Push for installed PWAs. SMS fallback is therefore mandatory, not optional.
4. **Barangay boundary data is accurate enough for geofencing.** PSA/PSGC boundaries are indicative, not survey-grade; geofence tolerance must be generous or valid reports near a boundary will be wrongly rejected.
5. **A DRRMO will eventually own the content.** Until the Authority Dashboard exists the dev team stands in — this is a prototype posture, not an operating model.

### Cost Model

Only SMS carries meaningful per-use cost; Vercel and Supabase free tiers cover a single-barangay pilot.

At PhilSMS ₱0.35/SMS, one alert broadcast to every enrolled resident costs `₱0.35 × enrolled`:

| Enrolled residents | Cost per broadcast | 10 broadcasts (one storm season) |
|---|---|---|
| 100 | ₱35 | ₱350 |
| 500 | ₱175 | ₱1,750 |
| 2,000 | ₱700 | ₱7,000 |

Two consequences the design already reflects: SMS is a **fallback**, not the default channel (push is free, so every push that lands is an SMS not sent), and OTP verification is one-time per number rather than per-session. A production deployment at municipal scale would need either an LGU-funded SMS budget or a telco public-service arrangement — worth pursuing alongside the official PAGASA data relationship.

### Implementation Phases

Mapped onto the repo's branch workflow — each phase has a concrete build plan, not just a feature list.

**Phase 1 (`hi-fi`)** — UI only, no backend. Detailed task breakdown: [docs/superpowers/plans/2026-09-01-hi-fi-WeatherWell.md](docs/superpowers/plans/2026-09-01-hi-fi-WeatherWell.md).
- Build: alert screen, evacuation screen (with pictogram cues), water-level report form (with the depth-reference visual), zone map, consent notice, **zone onboarding** (Core Feature #6, GPS detect + manual picker), **first-run onboarding gate** so a visitor actually reaches consent before anything else, **language toggle** (Filipino/English), and the **one-tap emergency hotline** — all on mock data.
- Plan: build components in shadcn/ui high-contrast theme → wire mock data fixtures → deploy Vercel preview → accessibility pass (automated axe audit + numeric WCAG contrast check + dim-light check).
- Exit criteria: full mock click-through starting from a fresh first-run, preview link ready for submission review.

The hotline, language toggle, and onboarding ship this early because they are cheap in UI-only form and because a demo that never shows the consent flow fails the PRD's own privacy requirement.

**Phase 2 (`v0`)** — Real data, real offline.
- Build: Supabase schema (`zones`/`alerts`/`water_level_reports`/`push_subscriptions`) + RLS, Server Actions, service worker caching, installable PWA manifest.
- Plan: write migrations → wire Server Actions → implement service worker + Background Sync → seed pilot barangay data → airplane-mode QA.
- Exit criteria: app works fully offline on real seeded data after first online visit.

**Phase 3 (`v1`)** — Core mechanism goes live.
- Build: threshold engine, PhilSMS fallback integration, Web Push subscription + delivery, the 3 cheap anti-abuse layers (geofence, rate limit, multi-report threshold).
- Plan: implement + unit-test threshold logic → integrate Push + PhilSMS with fallback ordering → geofence/rate-limit checks on report submission → integration test of push→SMS→cache fallback path.
- Exit criteria: a simulated crowd-report scenario correctly auto-triggers an alert and delivers via push, falling back to SMS in a test environment.

**Final Phase (`mvp`)** — Trust and inclusion polish that needs real usage to tune well.
- Build: reputation scoring, outlier downweighting, SMS OTP identity, audio/TTS alerts, SMS opt-in enrollment, full accessibility audit. (The emergency hotline itself shipped in Phase 1; what lands here is wiring it to real per-zone DRRMO numbers.)
- Plan: reputation model → OTP flow → TTS → SMS opt-in handler → real hotline numbers → full WCAG audit → field pilot in the chosen barangay → end-to-end QA → prep for `main` merge.
- Exit criteria: full feature set working together, audit passed, pilot feedback incorporated, submission-ready.

### Future Roadmap (beyond this project)

- Phone-to-phone Bluetooth mesh relay (native app required)
- Real water-level sensor hardware integration (schema already supports it)
- Authority Dashboard sub-project

### Open Risks

- PAGASA FFWSDO / official dam water-level API access unresolved
- bagyo-api is an unofficial third-party scraper — fine for a prototype, pursue an official relationship for production
- SMS cost scales with alert volume and subscriber count
- Web Push delivery isn't guaranteed (device/browser dependent) — SMS fallback is required, not optional, to cover this
- RA 10173 compliance is stated by design here but not legally reviewed — recommend actual legal review before any real deployment beyond the pilot
- The "SMS outlives data" assumption is unvalidated (see Assumptions #1). It is the single point the fallback design rests on; if it does not hold in a real outage, mesh relay stops being roadmap and becomes required
- Success-metric targets are hypotheses, not benchmarks — there is no baseline from a comparable PH deployment to calibrate against yet
