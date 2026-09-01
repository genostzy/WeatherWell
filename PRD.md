# PRD

*Single source of truth for this project. Phase 1 task breakdown: [docs/superpowers/plans/2026-09-01-hi-fi-WeatherWell.md](docs/superpowers/plans/2026-09-01-hi-fi-WeatherWell.md). Concept pitch: [IDEA.md](IDEA.md).*

## WeatherWell

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
- **MyShake / FEMA WEA** (international reference) — both validate the core patterns used here: MyShake turns phones into distributed sensors (we do the same with crowd water-level reports instead of seismometer data), and WEA-style systems push proactively rather than waiting for the user to check an app (we adopt the same push-first approach below).

This product's differentiation: predictive early warning with cascade alerts and a simulation/drill mode for DRRMO training — fully buildable without hardware or a native app, closing gaps the above systems leave open.

### Governance & Stakeholders

Not previously defined — stated explicitly here since the system has no automated "owner" for its content.

| Stakeholder | Role |
|---|---|
| **Residents** | End users; also crowdsourced data contributors via water-level reports |
| **Barangay/City DRRMO officers** | Authoritative owners of evacuation-zone content; become manual alert issuers/moderators once the Authority Dashboard sub-project ships |
| **Dev team (this project)** | System administrator through the phases below: hosts infrastructure (Vercel/Supabase), curates initial zone/evacuation data from public sources |
| **PAGASA / national agencies** | Indirect stakeholder — data source only, not a system user |

Until the Authority Dashboard sub-project exists, this system is **dev-curated, not officially operated** — the dev team stands in for the DRRMO role. This should be stated plainly wherever the system is presented, so it's clear this is a prototype standing in for a role barangay officials would eventually own.

### Scope

Software-only prototype. No physical hardware. Web-based, installable Progressive Web App (PWA), not a native app.

**Pilot scope:** one real barangay is the deployment target for this challenge. The app itself is multi-zone from Phase 1 — the hi-fi build carries three mock barangays so zone selection, zone listing, and the "no active alert" state are all exercisable, and the architecture supports unlimited zones without rework. One barangay is the *pilot*, not the *capacity*.

**In scope:**
1. Citizen-facing offline-capable alert app
2. Pre-authored, per-zone (barangay-level) evacuation instructions
3. Crowdsourced water-level reporting, feeding a threshold-based auto-alert trigger
4. Multi-channel alert delivery: push notification with retry → mock SMS fallback (demo) → offline cache; plus user-initiated "Share Alert" to Messenger/WhatsApp/Viber/SMS
5. Predictive flood timing & depth (confidence-tagged, conservative starting thresholds)
6. Cascade early warning (upstream → downstream zone alerts)
7. Admin simulation & drill mode (pre-built scenarios, dedicated `/admin` page)
8. Data model designed so the Authority Dashboard and a future real sensor-hardware feed can plug into the same tables later, without rework
9. Community relay system and printed emergency cards for non-smartphone residents

**Out of scope (explicit roadmap, not built this phase):**
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

**2. Push notification with retry, SMS mock, and share** — Delivery is attempted in priority order: (1) **push notification** via the Web Push API (proactive — reaches the user without them opening the app), retried once after 60s if the first attempt fails, (2) **mock SMS** — the UI shows "SMS sent ✓" to demonstrate the fallback path in the demo; no real SMS is sent in Phase 1. A real SMS provider (PhilSMS or equivalent) can be plugged in during Phase 3+ if needed, (3) locally cached data when all channels are unreachable. A **"Share Alert" button** lets residents forward the alert text to Messenger/WhatsApp/Viber/SMS through their own messaging apps — user-initiated, viral, free.

**3. Pre-authored, per-zone evacuation instructions** — Each zone has a static, pre-authored evacuation center and route, bundled/cached ahead of time, not computed live.

**4. Crowdsourced water-level reporting** — Residents report water depth using the depth-reference visual (dry/ankle/knee/waist/neck), geotagged and timestamped. Enough reports crossing a threshold in one zone within a time window auto-generates a zone alert. Reports made offline queue via the Background Sync API and send automatically once connectivity returns, instead of failing outright.

**5. Predictive flood timing & depth** — The prediction engine combines rainfall data (NASA GPM IMERG), terrain slope (SRTM DEM), and tidal data (NOAA) to estimate: (a) when flooding will reach a zone (timing), (b) how deep it will likely get (depth). Displayed as a simple timeline: "🟡 Advisory in 6h → 🟠 Watch in 3h → 🔴 Warning now → ⬛ Evacuate in 1h." Confidence level shown ("Estimated" until validated by local data).

**6. Cascade early warning** — If the prediction engine detects flooding heading toward downstream zones, it issues early warnings to those zones before their own crowd reports arrive. An upstream river gauge reading or heavy rainfall in Zone A triggers a "heads-up" alert in downstream Zone B — "Flooding detected upstream. Possible impact in 2–4 hours."

**7. Zone & hazard maps** — Barangay zone boundaries and evacuation points shown on a map built from static, bundled boundary data, consistent with the offline-first design.

**8. Zone onboarding** — First-time setup: GPS auto-detects the resident's likely zone, with a manual barangay picker as fallback (GPS denied, indoors, or wrong detection). Residents without smartphones are enrolled by an alert captain or DRRMO officer and receive a printed emergency card.

**9. One-tap emergency hotline** — A persistent, always-visible call button to the barangay/DRRMO emergency hotline, independent of app connectivity state.

**10. Admin simulation & drill mode** — A dedicated `/admin` page with pre-built scenarios (Approaching Typhoon, Flash Flood, Coastal Surge, Monsoon Rain, Clear Skies, Community Drill). DRRMO officers select a zone and scenario, then watch the full alert flow unfold in real-time — from prediction → alert issuance → push notification → mock SMS → cached data display. Includes explanation text at each step. Serves as both a training tool and a demo for stakeholders.

### Data Trust & Anti-Abuse

Crowdsourced water-level reports are the biggest fake-data risk surface (spam, panic-triggering false reports, downplayed reports, spoofed location). Layered defense, no single point of failure:

1. **Geofence check** — report must carry device GPS falling inside the claimed zone's boundary (checked against bundled zone polygon data). Outside-zone or missing-location reports are rejected or heavily downweighted.
2. **Rate limiting** — one report per device per short window (e.g. 10 minutes), preventing flood-spam from a single source.
3. **Multi-report threshold** — an alert requires several independent, agreeing reports in the same zone within a tight time window; no single report can trigger an alert alone.
4. **Outlier downweighting** — a report that disagrees sharply with nearby reports is discounted rather than trusted outright; clusters of agreement carry more weight than any lone report.
5. **Device fingerprint** — a random device ID stored in localStorage raises the cost of abuse above free-and-anonymous; rate limiting by device ID prevents one device from flooding reports.
6. **Reputation scoring** — devices whose past reports matched verified outcomes (official bulletins, other confirming reports) count more over time; devices with a poor track record count less. Self-correcting without manual moderation for most cases.
7. **Human override** — auto-triggered alerts are a fast first response, not final word. Once the Authority Dashboard sub-project exists, a DRRMO officer can confirm, downgrade, or cancel any auto-triggered alert.
8. **Audit trail** — every report is retained with timestamp, location, and device id, enabling later review and threshold/weight tuning.
9. **False-alarm downgrade UX** — if an auto-triggered alert is later downgraded (proven false or overstated), the app shows this transparently ("Alert downgraded — water levels below threshold") rather than silently removing it, so trust in the system doesn't erode through unexplained disappearing alerts.

*Layers 1–3 ship in Phase 3 (v1); layers 5–6 ship in the Final Phase (mvp) — see Implementation Phases below.*

### Accessibility & Inclusion

Target users are a broad, often vulnerable population under disaster stress — accessibility isn't cosmetic here, it determines whether an alert actually reaches and is understood by the person who needs it.

1. **Language** — Filipino (Tagalog) and English as the baseline; Cebuano added in Phase 2 (~20M Visayan speakers); zone data model stores instruction text per-language so additional regional languages (Ilocano, Hiligaynon, etc.) can be added without rework.
2. **WCAG AA baseline** — sufficient color contrast (critical for outdoor/low-light phone use — also reinforced by the high-contrast design language above), full keyboard navigation, screen-reader labels on all interactive elements, minimum touch target size for stressed or wet-handed use.
3. **Low-literacy design** — evacuation instructions paired with icon/pictogram cues and the depth-reference visual, not text-only, so meaning survives for residents who read poorly or not at all.
4. **Audio alerts** — critical alerts can optionally be read aloud (device text-to-speech), supporting visually impaired and low-literacy users; text-based delivery (on-screen, user-initiated share) stays primary too, so deaf/hard-of-hearing users aren't left dependent on audio.
5. **Enrollment without barriers** — enrollment happens in-app via the zone onboarding flow. Non-smartphone users are served through the community relay system (alert captains with smartphones knock on doors or call neighbors) and printed emergency cards distributed during enrollment drives.

### Privacy & Consent

The app collects location (geofencing, zone detection) — this is personal data under the **Philippines Data Privacy Act of 2012 (RA 10173)**, requiring informed, explicit consent and a transparent stated purpose before collection. Non-compliance carries real National Privacy Commission fines (up to ₱5M per violation for grave cases).

- A plain-language consent notice is shown before the first location request: what's collected, why, and how it's used — no pre-ticked boxes, no bundling with unrelated permissions.
- Location is used only for geofence validation and zone auto-detection, never stored beyond what's needed for report validation.
- Consent and data-handling notice ships from Phase 1 (hi-fi) as part of the UI, not deferred to a later phase.

### Power & Battery Considerations

During an extended outage there's no way to recharge — battery is a survival resource, not a convenience metric, which makes this a real design constraint unique to this app's premise.

- Dark-mode-default UI (see Design Language above) — OLED screens cut power draw significantly.
- Minimal background activity: no polling loops; service worker wakes only on push events or user action.
- Background Sync queues writes instead of retrying on a timer.
- **Battery-Aware Mode (Phase 2):** detect `navigator.getBattery()` (where available). Below 20% battery: reduce push frequency, simplify UI, pause non-essential updates. This extends survival during multi-day outages.

### Push Delivery Strategy

With SMS removed as a system-sent channel, push notification is the only proactive way to reach a resident without them opening the app. This makes push reliability critical.

- **Retry:** if the first push attempt fails (device offline, browser rejected), the service worker retries once after 60 seconds.
- **Mock SMS fallback (demo):** the UI shows "SMS sent ✓" to demonstrate the multi-channel flow. No real SMS is sent. A real provider can be plugged in during Phase 3+.
- **Share Alert button:** one-tap forward of the alert text to any installed messaging app (Messenger, WhatsApp, Viber, or the user's own SMS app via `sms:` URI). User-initiated — the system doesn't send messages, the user does. Viral, free, and uses the user's own data connection.
- **Full-content payload:** the push notification includes the full alert message (severity, zone, depth level, evacuation instruction) — not just "open the app." Even a dismissed notification shows critical info in the notification shade.
- **Cache fallback:** if all push attempts fail and the user hasn't opened the app, the alert is stored in the service worker cache and displayed on next app open, marked "last known, may be outdated."

### Community Relay & Non-Smartphone Access

The app serves smartphone users directly. Residents without smartphones are served through a low-tech, high-trust community relay system — zero cost, zero infrastructure.

- **Alert captains:** each zone designates 3–5 residents with smartphones who are responsible for knocking on doors or calling neighbors without phones during emergencies. These are trusted community members, not system accounts — no app or API access needed on their part beyond receiving the alert themselves.
- **Printed emergency cards:** distributed during enrollment drives. Each card shows: zone name, evacuation center location, evacuation route (with pictogram), emergency hotline number, and a QR code to install the app. Survives any outage. Laminate optional but recommended.
- **DRRMO manual call-back:** barangay officers use their own phones to call registered landline numbers during emergencies. Not automated, not scalable, but works for the handful of residents who need it.
- **Enrollment without a smartphone:** residents without smartphones can be enrolled by an alert captain or DRRMO officer who enters their zone assignment into the system on their behalf. The resident receives a printed emergency card with their zone info.

This is not a technical system — it's an operational one. It requires coordination with the barangay during the pilot, not code.

### Data Sources (locked)

| Purpose | Source | Notes |
|---|---|---|
| Weather/typhoon bulletins | [PANaHON](https://panahon.gov.ph/) (DOST-PAGASA official) | Authoritative reference; no confirmed public dev API |
| Weather/typhoon bulletins (dev integration) | [bagyo-api](https://github.com/edwardguevarra/bagyo-api) | Free, keyless REST/JSON. Third-party, unofficial |
| Bulletin parsing/archive | [PAGASA Parser](https://pagasa.chlod.net/) / [bulletin-archive](https://github.com/pagasa-parser/bulletin-archive) | Historical + parsed bulletins |
| Rainfall backup | [NASA GPM IMERG](https://gpm.nasa.gov/data) | Satellite rainfall, 30-min resolution |
| Flood/dam water levels | PAGASA FFWSDO / [ProjectLIGTAS](https://projectligtas.com/flood_monitoring) | No confirmed open third-party API — access gap; crowdsourced reports cover this for now |
| Barangay boundaries / zone maps | [GeoRisk ArcGIS REST (PSA/Barangay)](https://portal.georisk.gov.ph/arcgis/rest/services/PSA/Barangay/MapServer), [philippines-json-maps](https://github.com/faeldon/philippines-json-maps), [philippines-psgc-shapefiles](https://github.com/altcoder/philippines-psgc-shapefiles) | Static — bundled directly into the app |
| SMS delivery (optional, Phase 3+) | [PhilSMS](https://www.philsms.com/) (₱0.35/SMS) | REST API, no minimum top-up; only needed if real SMS delivery is required beyond the demo |
| SMS delivery backup (optional, Phase 3+) | [Semaphore](https://semaphore.co/) (₱0.50/SMS) | Alternative provider |

### Architecture

- **Frontend/App shell:** Next.js (App Router), TypeScript strict, RSC-first, feature-based structure
- **UI:** shadcn/ui + Tailwind, High-Contrast Utility-First theme, dark-mode-default
- **Backend/data:** Supabase — tables for `zones`, `alerts`, `water_level_reports`, `push_subscriptions`, `audit_log`, `evacuation_centers`; Row Level Security; Server Actions for all writes
- **Offline layer:** Service worker cache (cache-first for `zones`/evacuation data, long TTL; network-first with cache fallback for `alerts`); Background Sync for offline report submission
- **Push:** Web Push API (VAPID keys), service worker handles push events and displays notifications even when the app isn't open; retries once after 60s if first attempt fails
- **SMS (mock in Phase 1):** UI displays "SMS sent ✓" to demonstrate the fallback path; real SMS provider (PhilSMS or equivalent) plugged in during Phase 3+ if needed
- **Prediction engine:** server-side (Supabase Edge Functions or Next.js API routes). Combines GPM rainfall + SRTM slope + NOAA tides → timing + depth estimate per zone. Conservative thresholds, confidence tagging, calibration loop.
- **Cascade warning:** upstream zone alert → downstream zone "heads-up" alert before crowd reports arrive
- **Depth reference:** severity/depth level enum shared between the report form, the map, and alert styling — one source of truth, not duplicated logic

**Schema (illustrative):**
- `zones`: id, psgc_barangay_code, name, evacuation_center_name, evacuation_route_text (jsonb, per-language), slope_angle, drainage_density, downstream_zone_id (for cascade warnings)
- `alerts`: id, zone_id, severity (yellow/orange/red/evacuate), message (jsonb per-language), source (manual/auto_crowdsourced/predicted/cascade), confidence (estimated/validated/calibrated), predicted_depth, predicted_timing, issued_at, expires_at, is_active
- `water_level_reports`: id, zone_id, device_id, depth_level (dry/ankle/knee/waist/neck), lat/lng, trust_weight, is_outlier, reported_at
- `push_subscriptions`: id, zone_id, device_id, endpoint, keys (jsonb)
- `audit_log`: id, actor (device_id/officer), action (alert_issued/alert_edited/alert_cancelled/report_submitted), target_id, timestamp, details (jsonb)
- `evacuation_centers`: id, zone_id, name, capacity (jsonb per-language), current_status (space_available/limited/full), updated_at, updated_by

**Auto-trigger rule (illustrative, tunable):** ≥3 reports from different devices, same zone, within 30 minutes, average depth ≥ `waist` → auto-creates a Red-severity alert.

**Conservative starting thresholds (tunable per zone):**

| Zone type | 6h rainfall | 12h rainfall | 24h rainfall | Crowd reports |
|---|---|---|---|---|
| Low-lying, near river | 30mm → Advisory | 50mm → Watch | 80mm → Warning | ≥3 reports → Red |
| Moderate elevation | 50mm → Advisory | 80mm → Watch | 120mm → Warning | ≥3 reports → Red |
| High elevation | 80mm → Advisory | 120mm → Watch | 180mm → Warning | ≥5 reports → Red |

Start conservative (warn earlier, accept more false positives). "Better to warn and be wrong than miss a real event."

**Confidence tagging:** every prediction is tagged with a confidence level:
- **Estimated** — initial thresholds, no real event validation yet. Shown to users but clearly marked.
- **Validated** — after ≥3 real events where the prediction matched actual crowd reports. More authoritative.
- **Calibrated** — after ≥10 real events, auto-tuned by the calibration loop. Highest confidence.

Confidence level is displayed in the UI: "⚠️ Estimated — based on initial thresholds" vs "✓ Validated by local data."

**Calibration loop (Phase 3+):** after each real flood event, the system compares:
1. What the threshold engine predicted (alert severity, timing)
2. What actually happened (crowd reports, official bulletins)

If predictions were too conservative (too many false alarms), thresholds shift up slightly. If predictions missed real events, thresholds shift down. Auto-adjusts within guardrails (never above official PAGASA thresholds, never below minimum safety margins).

### Data Flow

1. Resident installs the app, grants (or declines) location/notification permission after seeing the consent notice, selects or auto-detects their zone.
2. A new alert is issued (manually by an authority in a later phase, or auto-triggered by the threshold engine) → push notification attempted first, retried once after 60s if unconfirmed; UI shows mock SMS as fallback in the demo; "Share Alert" button available for user-initiated forwarding.
3. Connectivity is fully down → app serves cached alert/zone data; UI marks it "last known, may be outdated."
4. Resident submits a water-level report → if offline, queued via Background Sync; once sent, written to `water_level_reports` → threshold engine evaluates recent reports per zone → auto-creates an `alerts` row if threshold crossed.

### Non-Functional Requirements

- Must run acceptably on low-end Android devices common in flood-prone areas
- Must be installable as a PWA for reliable offline cache behavior
- Push notification retry must not block the main thread or drain battery
- Must comply with RA 10173 consent requirements before any location collection
- UI must remain legible in direct sunlight and in the dark, without relying on brightness alone

### Error Handling

- Stale cached data is visually flagged, never presented as live without qualification
- Crowdsourced reports go through the full Data Trust & Anti-Abuse pipeline above before affecting any alert
- Push delivery failures are logged and retried once; "Share Alert" button serves as user-initiated fallback
- Downgraded/cancelled auto-alerts are shown transparently, not silently removed

### Testing Approach

- Unit tests for the threshold-trigger engine
- Integration test simulating offline mode (service worker cache-first behavior) and Background Sync report queuing
- Push delivery retry test: verify retry fires after 60s on failed first attempt
- Manual QA: airplane-mode device test, sunlight/dim-light legibility check
- Community relay test: verify alert captain receives alert and can relay to non-smartphone neighbors
- Field pilot with the single pilot barangay before considering a wider rollout (Final Phase)

### Success Metrics

How to tell whether this actually works, rather than merely ships. Targets are initial hypotheses to validate in the pilot, not guarantees.

**Primary — does the alert reach people when it matters?**

| Metric | Definition | Target |
|---|---|---|
| Alert reach | Enrolled residents in a zone who received an alert by any channel (push including retry, or opened the app and saw cached state) ÷ enrolled residents in that zone | ≥ 90% |
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
| Enrollment | Households enrolled (app install or community relay enrollment) ÷ households in the pilot barangay | ≥ 30% |
| Retention through an event | Enrolled users still enrolled 30 days after a flood event | ≥ 80% |

Phase 1 (`hi-fi`) cannot move any of these — it has no backend and no users. Its own exit bar is the qualitative one already stated: a complete first-run click-through and a passing accessibility audit.

### Assumptions & Dependencies

Stated explicitly because the design leans on them, and one of them is load-bearing.

1. **Residents have a smartphone with a modern browser.** Those who don't are served by the community relay system (alert captains with smartphones knock on doors or call neighbors) and printed emergency cards distributed during enrollment.
2. **Web Push is not guaranteed.** Delivery depends on device, browser, and OS battery policy — iOS only supports Web Push for installed PWAs. Push retry (once after 60s) and the "Share Alert" button compensate; cached data is the final fallback. Real SMS can be added in Phase 3+ if needed.
3. **Barangay boundary data is accurate enough for geofencing.** PSA/PSGC boundaries are indicative, not survey-grade; geofence tolerance must be generous or valid reports near a boundary will be wrongly rejected.

### Cost Model

All infrastructure runs on free tiers. Zero recurring costs for the prototype.

- **Vercel** (Hobby) — free
- **Supabase** (free tier) — ₱0/month, 2 project limit
- **GitHub** — free
- **Web Push / VAPID** — free, no external service needed
- **All data sources** — free (bagyo-api is keyless, NASA GPM and PSA/GeoRisk boundary data are open)

**Free-tier operating constraints** — these cost a working demo rather than money, so they are planning items, not footnotes:

- **Supabase free projects pause after roughly a week of inactivity.** A reviewer opening the link weeks after submission would find a sleeping database and a broken-looking app. Either wake the project before any judging window, or submit the Phase 1 (`hi-fi`) build, which has no backend to sleep.
- **The Supabase free tier caps active projects per organization.** Confirm headroom before Phase 2 rather than discovering it mid-migration.
- **Vercel Hobby is non-commercial only.** Fine for this challenge; an LGU-operated deployment would need a paid plan.

**SMS (optional, Phase 3+):** the demo shows a mock "SMS sent ✓" indicator with no real API call. If real SMS delivery is needed later, PhilSMS (₱0.35/SMS) or Semaphore (₱0.50/SMS) can be plugged in. Sender-ID registration takes ~2–4 weeks — start early if pursuing this.

**Total prototype cost: ₱0/month.**

### Implementation Phases

Mapped onto the repo's branch workflow — each phase has a concrete build plan, not just a feature list.

**Phase 1 (`hi-fi`)** — UI only, no backend. Everything is mock. Detailed task breakdown: [docs/superpowers/plans/2026-09-01-hi-fi-WeatherWell.md](docs/superpowers/plans/2026-09-01-hi-fi-WeatherWell.md).

**What's mock in Phase 1:**
- Alert data: hardcoded Typhoon Ondoy 2009 scenario (real rainfall amounts, real timeline)
- Zone data: 3 mock zones with real barangay names, real evacuation center names
- Push notifications: simulated (UI shows "Push sent ✓", no real push)
- SMS: simulated (UI shows "SMS sent ✓", no real SMS)
- Prediction engine: hardcoded timeline ("🟡 Advisory in 6h → 🟠 Watch in 3h → 🔴 Warning now → ⬛ Evacuate in 1h"), no real calculation
- Cascade warnings: hardcoded upstream→downstream alert, no real detection
- Water-level reports: hardcoded mock reports in the form
- Evacuation center capacity: hardcoded "Space available" / "Limited" / "Full"
- Confidence level: hardcoded "Estimated" badge
- Admin simulation: pre-built scenarios with hardcoded data, real-time preview of the alert flow
- Community relay: mock printed emergency card layout
- Hotline: hardcoded phone number
- Depth reference visual: functional (renders correctly)

**What's real in Phase 1:**
- UI components (shadcn/ui, high-contrast theme, dark mode)
- Zone onboarding flow (GPS detect + manual picker — real browser APIs)
- Consent notice (real permission requests)
- Language toggle (Filipino/English — real i18n)
- Offline caching (service worker — real, functional)
- Accessibility (WCAG AA contrast, keyboard nav, screen reader labels)
- Vercel deployment (real, live preview link)

**What's NOT in Phase 1:**
- No Supabase / no database
- No real push notifications
- No real SMS
- No real prediction engine
- No real cascade warnings
- No real water-level report submission
- No real data sources connected

- Build: alert screen, evacuation screen (with pictogram cues), water-level report form (with the depth-reference visual), zone map, consent notice, **zone onboarding** (Core Feature #8, GPS detect + manual picker), **first-run onboarding gate** so a visitor actually reaches consent before anything else, **language toggle** (Filipino/English), the **one-tap emergency hotline**, and **admin simulation page** (`/admin`) with pre-built scenarios — all on realistic mock data.
- Plan: build components in shadcn/ui high-contrast theme → wire mock data fixtures → deploy Vercel preview → accessibility pass (automated axe audit + numeric WCAG contrast check + dim-light check).
- Exit criteria: full mock click-through starting from a fresh first-run, preview link ready for submission review. Admin page demonstrates the full alert flow (select zone → choose scenario → preview alert → see "Push sent ✓" → see "SMS sent ✓" → see cached data).

The hotline, language toggle, and onboarding ship this early because they are cheap in UI-only form and because a demo that never shows the consent flow fails the PRD's own privacy requirement.

**Phase 2 (`v0`)** — Real data, real offline.
- Build: Supabase schema (`zones`/`alerts`/`water_level_reports`/`push_subscriptions`) + RLS, Server Actions, service worker caching, installable PWA manifest. Add `confidence` field to alerts schema. Add `audit_log` table.
- Plan: write migrations → wire Server Actions → implement service worker + Background Sync → seed pilot barangay data with realistic mock (Typhoon Ondoy scenario) → airplane-mode QA → set up Sentry free tier for error monitoring → set up UptimeRobot for uptime monitoring → add data retention auto-deletion cron.
- Exit criteria: app works fully offline on real seeded data after first online visit. Error monitoring active. Uptime monitoring active.

**Phase 3 (`v1`)** — Core mechanism goes live.
- Build: threshold engine with conservative starting thresholds, Web Push subscription + delivery with retry, the 3 cheap anti-abuse layers (geofence, rate limit, multi-report threshold). Optional: real SMS provider integration (PhilSMS or equivalent) if needed beyond the demo. Configurable geofence tolerance per zone. Audit trail logging.
- Plan: implement + unit-test threshold logic with conservative thresholds → implement Push with retry → geofence/rate-limit checks on report submission → integration test of push→cache fallback path → add configurable geofence tolerance (default 100m buffer) → log all alert actions to audit_log.
- Exit criteria: a simulated crowd-report scenario correctly auto-triggers an alert and delivers via push, with retry working correctly. Confidence tagging visible in UI. Audit trail functional.

**Final Phase (`mvp`)** — Trust and inclusion polish that needs real usage to tune well.
- Build: reputation scoring, outlier downweighting, device fingerprint identity, audio/TTS alerts, calibration loop, evacuation center live status, community feedback loop, field pilot in the chosen barangay, full accessibility audit. (The emergency hotline itself shipped in Phase 1; what lands here is wiring it to real per-zone DRRMO numbers.)
- Plan: reputation model → device fingerprint → TTS → calibration loop → evacuation center status → 1-question post-event survey → real hotline numbers → full WCAG audit → field pilot → end-to-end QA → prep for `main` merge.
- Exit criteria: full feature set working together, audit passed, pilot feedback incorporated, submission-ready.

### Future Roadmap (beyond this project)

- Real water-level sensor hardware integration (schema already supports it)
- Authority Dashboard sub-project

### Data Retention Policy

| Data type | Retention | Reason |
|---|---|---|
| Location (from reports) | 24 hours | Only needed for geofence validation |
| Crowd reports | 1 year | Needed for calibration loop |
| Predictions / alerts | 2 years | Needed for model improvement |
| Device fingerprints | Until user clears storage | Rate limiting |
| Alerts (issued) | Indefinite | Historical record, audit trail |

Automated deletion via Supabase cron job. Users can request early deletion via the data export/deletion API.

### RA 10173 Article 16 Compliance (Data Export & Deletion)

- `GET /api/data-export` — returns all data associated with the user's device ID (reports, zone assignment, device fingerprint)
- `DELETE /api/data-deletion` — deletes all data associated with the device ID
- Both endpoints available from Phase 2. No phone numbers are stored, so phone-related deletion is not needed.

### Geofence Accuracy

PSA/PSGC boundaries are indicative, not survey-grade. Mitigations:

- **Configurable tolerance** — each zone has a geofence buffer (default 100m). Reports within the buffer are accepted.
- **Distance-weighted scoring** — reports near zone boundaries are accepted but weighted slightly lower than reports from the zone center.
- **Manual zone selection** — residents can manually override their detected zone if GPS places them outside their actual zone.

### Multi-Hazard Data

The prediction engine uses:

- **Rainfall** — NASA GPM IMERG (satellite, 30-min resolution)
- **Slope/terrain** — NASA SRTM DEM (30m resolution, one-time processing to extract slope per zone)
- **Wind speed** — bagyo-api (real-time typhoon wind data)
- **Tidal data** — NOAA Tides & Currents API (for coastal zones)
- **Building density** — PSA census data (housing units / zone area)

Phase 1 uses mock slope and wind data for the 3 mock zones. Phase 2 bundles real slope from SRTM and real wind from bagyo-api.

### Evacuation Center Capacity

Feature 22 — crowdsourced live status:

- Residents at the center update capacity: "Space available" / "Limited space" / "Full"
- Updates stored in Supabase, displayed on the zone's evacuation screen
- Phase 1: mock data. Phase 3: real crowdsourced updates.

### Disaster Recovery

- Supabase free tier includes daily backups (7-day retention)
- Phase 2: export critical data (zones, evacuation instructions) to a JSON file in the repo as a backup seed
- If the database is lost, re-seed from the JSON file

### Discoverability (No SEO Needed)

This is a hyperlocal app, not a website. Distribution is physical, not digital:

- **QR codes** — printed and distributed by DRRMO during enrollment drives. Each zone gets its own QR code linking to the app with zone pre-selected.
- **Printed emergency cards** — distributed to every household. Include QR code + app install instructions.
- **Word of mouth** — the Community Drill scenario is a viral moment — residents share the experience with neighbors.
- **Barangay bulletin boards** — post flyers with QR code and simple instructions.

### DRRMO Training (Built Into the App)

No separate training materials needed. The Community Drill scenario (Feature 10, Admin simulation & drill mode) walks officers through the system step-by-step with explanation text. The admin panel IS the training — it teaches itself through use.

### Analytics (Optional, Privacy-Respecting)

Skip for prototype. If usage data is desired in Phase 2+:

- [Plausible](https://plausible.io/) — no cookies, GDPR-compliant
- [Umami](https://umami.is/) — self-hosted, no cookies

The calibration loop (predictions vs actuals) is more important than usage analytics.

### Schema Additions

Already included in the main schema above:
- `alerts`: `confidence` field (estimated/validated/calibrated), `source` includes `predicted` and `cascade`, `predicted_depth`, `predicted_timing`
- `zones`: `slope_angle`, `drainage_density`, `downstream_zone_id` (for cascade warnings)
- `audit_log`: new table for tracking all alert actions
- `evacuation_centers`: new table for capacity tracking

### Audit Trail

Every alert issuance, edit, and cancellation is logged in `audit_log` with timestamp, actor, and action. Admin dashboard (Phase 3) has an audit trail viewer.

### Community Feedback Loop

After each alert expires, a 1-question survey: "Was this alert useful? (Yes / No / Too early / Too late)." Responses stored for calibration. Admin dashboard shows feedback summary per zone.

### Open Risks

- PAGASA FFWSDO / official dam water-level API access unresolved
- bagyo-api is an unofficial third-party scraper — fine for a prototype, pursue an official relationship for production
- Web Push delivery isn't guaranteed (device/browser dependent) — push retry and Share Alert button compensate, but this remains the primary delivery risk
- RA 10173 compliance is stated by design here but not legally reviewed — recommend actual legal review before any real deployment beyond the pilot
- Non-smartphone users have no direct app access — served only by community relay and printed cards, which require operational coordination
- Success-metric targets are hypotheses, not benchmarks — there is no baseline from a comparable PH deployment to calibrate against yet
