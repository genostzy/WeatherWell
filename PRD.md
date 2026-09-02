# PRD

*Single source of truth for this project. Concept pitch: [IDEA.md](IDEA.md).*

## WeatherWell

*(Challenge: Climate Resilience and Hydrometeorological Disaster Management)*

### Background

The Philippines experiences an average of twenty tropical cyclones a year. When severe typhoons strike, infrastructure collapse routinely severs internet and cellular connections, cutting off centralized, cloud-based early warning systems precisely when communities need them most. Local communities also struggle to translate broad national weather data into actionable, street-level evacuation protocols, and affordable, localized water-level sensors for real-time flood alerts remain largely unavailable.

### Why This Matters

- **Connectivity fails when you need it most** — existing early warning systems rely on live internet. When the network goes down during a typhoon, residents are left without guidance.
- **National data isn't local enough** — weather bulletins give province-level warnings, not street-level "should I evacuate now?" answers.
- **Sensors are expensive** — real water-level hardware costs more than most barangays can afford. The community itself is the best sensor.
- **No training tool exists** — DRRMO officers have no safe way to practice issuing alerts and coordinating evacuations before a real event.

**WeatherWell solves all four:** offline-first caching, crowdsourced flood reports, predictive early warning, and a built-in simulation/drill mode — all in a PWA that costs nothing to run.

### Governance

Two roles. No officers, no role-based access control.

| Stakeholder | Role |
|---|---|
| **Admin (developer)** | System operator — issues alerts, edits content, moderates community pins, manages infrastructure. Protected by a 4-digit PIN (Phase 2 — Phase 1's `/admin` is an unauthenticated mock/demo surface, no real actions taken). |
| **Residents** | End users — view alerts, report water levels, view evacuation instructions, share alerts. Guest mode default, no account required. |

### Scope

Software-only prototype. No physical hardware. PWA, not native app.

**Pilot scope:** one real barangay is the deployment target. The app itself is multi-zone from Phase 1 — three mock barangays carry the hi-fi build so zone selection and the "no active alert" state are all exercisable.

**In scope:**
1. Offline-first alert display (PWA with service worker cache)
2. Push notification with retry → mock SMS fallback (demo) → offline cache
3. Pre-authored, per-zone evacuation instructions
4. Interactive homepage map — live location, zone status (Safe/Cautionary/Dangerous/Hazardous), essential-service & evacuation POIs, safest-route guidance
5. Crowdsourced water-level reporting with auto-alert trigger
6. Community flood pins — citizen-dropped map pins (status tag, caption, optional photo), up/down voted with net-score removal
7. Predictive flood timing & depth (confidence-tagged)
8. Cascade early warning (upstream → downstream)
9. Hazard-tile map backdrop — static baseline Flood/Landslide/Storm Surge risk per zone, shown as the map's tile layer instead of drawn zone boundaries (mocked in Phase 1, real open government hazard data in Phase 2+)
10. Admin simulation & drill mode (6 pre-built scenarios; PIN-protected from Phase 2, unauthenticated mock in Phase 1)
11. Share Alert button (user-initiated forwarding to Messenger/WhatsApp/Viber/SMS)
12. Community relay system + printed emergency cards for non-smartphone residents
13. Optional account with guest-first access (Phase 2)

**Out of scope:**
- Physical water-level sensor hardware
- Live shortest/safest-path routing engine in Phase 1 (routes are pre-authored per zone→destination pair, same as evacuation instructions; a real routing engine — self-hosted, free — lands Phase 2+)

### Target Users

- Residents of flood- and typhoon-prone barangays
- The developer/admin who operates the system

### Design & UX

**shadcn/ui, High-Contrast Utility-First aesthetic. Dark-mode-default.**

- **Dark-mode-default** — OLED screens cut power draw significantly. Battery survival during an outage is a real design constraint.
- **Homepage is the map** — first screen a resident sees. Full-bleed map with a hazard-tile backdrop, centered on the resident's live location, with zone-status, evacuation, and essential-service markers, plus one-tap route guidance. Alert detail, water-level report, and evacuation instructions are one tap from any marker.
- **No drawn zone boundaries** — the map never renders barangay polygon outlines or fills. Baseline risk comes from a continuous hazard-tile backdrop, not administrative polygons; live per-zone status is a marker on top of it, not an area fill. Zone boundary data still exists and is still needed for geofencing (validating that a report or pin's GPS falls inside its claimed zone) — this removes boundaries from the map's visual rendering only, not from the data model. Simpler to build (no boundary styling/rendering work) and avoids implying false map precision at a zone's edges.
- **Severity color system is the entire visual language** — Yellow / Orange / Red / Evacuate across alert banners, depth reference, zone status markers, buttons. One color grammar. The homepage map's Safe/Cautionary/Dangerous/Hazardous legend is a plain-language reading of this same grammar (see Zone Status Legend), not a second scale.
- **Zone status is never color-only on the map** — a colored marker is still hard to distinguish by hue alone. Each zone's status marker pairs an icon or shape with its color, so colorblind users can read Safe/Cautionary/Dangerous/Hazardous without relying on color.
- **A persistent marker legend** explains each map icon (zone status, evacuation center, health center, pharmacy, market, water station, barangay office) at a glance — with the hazard-tile backdrop, status markers, evacuation pins, and service markers all on one screen, an unexplained icon set would work against "large targets, minimal text," not for it.
- **No decorative chrome** — flat shadcn components, thick borders over soft shadows (visible in sunlight), system font stack only.
- **Progressive disclosure** — stressed user sees only the next needed action, not a dashboard.
- **Large targets, minimal text** — one-handed, injured, or shaking-hand use. Short plain-language fragments.
- **Depth-reference visual** — adult (170cm) and child (110cm) silhouettes on a shared ground line under a single shared waterline, colored through Yellow→Orange→Red→Evacuate. At neck depth (150cm) the child is fully submerged while the adult is not.
- **Checked under dim light and at arm's length**, not just in a bright design tool.

**Severity & Depth Values:**

| Severity | Label | Hex | Contrast |
|---|---|---|---|
| `yellow` | Advisory | `#eab308` | 10.9:1 |
| `orange` | Watch | `#f97316` | 7.5:1 |
| `red` | Warning | `#dc2626` | 4.8:1 |
| `evacuate` | Evacuate Now | `#7f1d1d` | 10.0:1 |

| Depth | Approx. depth | Maps to |
|---|---|---|
| `dry` | 0 cm | yellow |
| `ankle` | 15 cm | yellow |
| `knee` | 45 cm | orange |
| `waist` | 90 cm | red |
| `neck` | 150 cm | evacuate |

**Homepage Map — Zone Status Legend:**

| Map label | Meaning | Maps to severity | Color |
|---|---|---|---|
| Safe | No active alert | *(zero-state, not an alert severity)* | Green `#22c55e` |
| Cautionary | Early-stage risk | `yellow` (Advisory), `orange` (Watch) | Yellow / Orange |
| Dangerous | Active flooding | `red` (Warning) | Red |
| Hazardous | Evacuate now | `evacuate` (Evacuate Now) | Dark red |

Four plain-language labels for at-a-glance map reading, in keeping with the low-literacy design principle. The underlying severity system — colors, contrast ratios, alert copy — is unchanged; this is a map-legend simplification, not a second severity scale. "Safe" is new: it names the already-existing "no active alert" state, which the zone map and admin simulation already render in green. On the homepage map this status renders as a colored marker at the zone's location, not an area fill — see "No drawn zone boundaries" above.

### Core Features

1. **Offline-first alert display** — PWA with service worker pre-caches latest alert and evacuation instructions. If connectivity drops, cached data continues showing.

2. **Push notification with retry** — Proactive delivery via Web Push API. Retried once after 60s if first attempt fails. Includes full alert content (severity, zone, depth, evacuation instruction), not just "open the app." Cache fallback if all push attempts fail.

3. **Pre-authored evacuation instructions** — Each zone has static, pre-authored evacuation center and route, bundled ahead of time, not computed live.

4. **Crowdsourced water-level reporting** — Residents report water depth (dry/ankle/knee/waist/neck), geotagged and timestamped. Enough reports crossing a threshold auto-generates a zone alert. Offline reports queue via Background Sync.

5. **Community flood pins** — Any resident can drop a pin on the homepage map with a status tag (Flooded / Rising / Receding / Impassable), a short caption, and an optional photo. In Phase 1 the photo is attached client-side only — shown as a preview in the UI, never uploaded to any backend — so it costs nothing and needs no connectivity; whether photo upload goes live for real is a Phase 2+ decision weighed against storage cost and bandwidth during degraded connectivity. Other residents vote a pin up or down; a pin is removed once downvotes exceed upvotes by 5, and its creator is notified (reusing the push-notification pipeline). Voting is geofenced and rate-limited exactly like water-level reports (one vote per device, only from within the pin's zone) to resist brigading. Pins are a clearly labeled, unverified community layer, separate from official Alerts — they never auto-promote into a Warning/Evacuate alert; that stays behind the existing multi-report threshold pipeline. Admin can manually remove or restore any pin, the same override the alert pipeline already has.

6. **Predictive flood timing & depth** — Combines rainfall data, terrain slope, and tidal data to estimate when flooding will reach a zone and how deep it will get. Confidence level shown ("Estimated" until validated).

7. **Cascade early warning** — Upstream zone alert triggers "heads-up" for downstream zones before their own crowd reports arrive.

8. **Hazard-tile map backdrop** — Instead of drawn zone boundaries, the homepage map's persistent backdrop is a hazard-susceptibility tile shading showing each zone's baseline Flood/Landslide/Storm Surge risk (Low/Medium/High), independent of whether there's an active alert right now — a distinction between long-term hazard susceptibility and live conditions. Phase 1 mocks this styling for the three demo zones; Phase 2+ replaces it with real data from open Philippine government hazard datasets (DENR-MGB geohazard maps, PAGASA). Live per-zone alert status layers on top as a colored marker, never confused with this baseline backdrop since one is a tile fill and the other is a point marker.

9. **Interactive homepage map** — The app's landing screen. Full-bleed map centered on the resident's live geolocation (manual pin-drop if permission is denied), backed by the hazard-tile layer (no drawn zone boundaries). Each zone's live alert status appears as a colored marker using the plain-language legend (Safe / Cautionary / Dangerous / Hazardous — see Zone Status Legend). Evacuation centers, essential-service points (health center, pharmacy, market, water refilling station, barangay office), and community flood pins are shown with distinct icons, explained by a persistent on-map legend so markers add clarity instead of clutter; tapping a marker opens its alert, evacuation, or pin detail. A "Safest Route" action recommends a path to the nearest evacuation center, favoring routes that avoid Dangerous/Hazardous zones over the merely-shortest one — pre-authored per zone→evacuation-center pair in Phase 1 (same static-route approach as evacuation instructions); routing to essential-service destinations and a real routing engine both arrive in Phase 2+. If every path unavoidably crosses a Dangerous/Hazardous zone, that route is still shown as the best available option but visibly flagged as passing through a hazardous area — never presented as safe when it isn't. If no map tiles are cached (e.g. a fresh install with no connectivity), the homepage falls back to a simple list view of zone alerts — same data, no basemap — instead of rendering a blank map.

10. **Zone onboarding** — GPS auto-detects likely zone, manual picker as fallback. Non-smartphone users enrolled by alert captain, receive printed emergency card.

11. **One-tap emergency hotline** — Persistent call button to barangay emergency hotline, independent of connectivity.

12. **Admin simulation & drill mode** — Dedicated `/admin` page with 6 pre-built scenarios. Admin selects zone and scenario, watches full alert flow unfold in real-time with explanation text. PIN-protected from Phase 2; Phase 1 ships it as an unauthenticated mock demo surface.

13. **Share Alert button** — One-tap forward of alert text to any messaging app (Messenger, WhatsApp, Viber, SMS). User-initiated, viral, free.

14. **Optional account** — App works fully without an account (device fingerprint, geofence, local storage). Optional email+password (Phase 2) adds cross-device sync. Guest mode is default, login prompt is dismissible.

### Anti-Abuse

Crowdsourced reports are the biggest fake-data risk. Layered defense:

1. **Geofence check** — report must carry GPS falling inside the claimed zone's boundary. Configurable tolerance per zone (default generous).
2. **Rate limiting** — one report per device per short window.
3. **Multi-report threshold** — alert requires several independent, agreeing reports in the same zone; no single report triggers alone.
4. **Outlier downweighting** — report disagreeing sharply with nearby reports is discounted.
5. **Device fingerprint** — random device ID in localStorage raises abuse cost.
6. **Reputation scoring** — devices with past reports matching verified outcomes count more. Self-correcting.
7. **Human override** — auto-triggered alerts are a fast first response, not final word. Admin can confirm, downgrade, or cancel.
8. **Audit trail** — every report retained with timestamp, location, device id for later review.
9. **Transparent downgrade** — if alert is downgraded, shown transparently ("Alert downgraded — water levels below threshold"), not silently removed.
10. **Pin vote protection** — community flood pin votes reuse layers 1, 2, and 5 (geofence, rate limit, device fingerprint): one vote per device per pin, only from within the pin's zone, so a single actor can't brigade a pin up or down. Removal triggers on **net score** (downvotes exceeding upvotes by 5), not a raw downvote count, so a well-corroborated pin isn't killed by a handful of bad-faith downvotes. Same human-override principle as layer 7: admin can manually remove a pin early or restore one that voting removed wrongly — a needed safety valve since layers 1, 2, and 5 aren't real until Phase 3/Final Phase (see note below).

*Layers 1–3 ship in Phase 3; layers 5–6 ship in Final Phase. Layer 10 (pin votes) ships alongside community flood pins in Phase 1 as a mock/UI-only rule. Its real enforcement follows the same two-stage schedule as the layers it reuses — geofence and rate limit in Phase 3, device-fingerprint hardening in Final Phase — so full real protection for pin votes isn't complete until Final Phase, exactly matching water-level reports' own timeline.*

### Accessibility

Target users are a broad, often vulnerable population under disaster stress.

1. **Language** — Filipino and English baseline; Cebuano in Phase 2 (~20M Visayan speakers). Zone data model stores per-language text for future regional languages.
2. **WCAG AA** — sufficient color contrast, full keyboard navigation, screen-reader labels, minimum touch target size, non-color-only signaling (e.g. the homepage map's zone-status markers pair color with an icon, not hue alone).
3. **Low-literacy design** — evacuation instructions paired with icon/pictogram cues and the depth-reference visual, not text-only.
4. **Audio alerts** — critical alerts can optionally be read aloud (device TTS). Text-based delivery stays primary for deaf/hard-of-hearing users.
5. **Enrollment without barriers** — non-smartphone users served through community relay (alert captains) and printed emergency cards.

### Privacy & Data

Location is personal data under the **Philippines Data Privacy Act of 2012 (RA 10173)**.

- Plain-language consent notice shown before first location request: what's collected, why, how — no pre-ticked boxes.
- Location used only for geofence validation and zone auto-detection, never stored beyond what's needed.
- **The homepage map's location dot is live** — continuous tracking (`watchPosition`, not a one-time fetch) while the map is open, stopping when the map is closed or the app is backgrounded. The consent notice covers this continuous use explicitly, distinct from the one-time fetch used for zone auto-detection. Position is never stored — it exists only in memory while the map is open.
- If account created (Phase 2), email for authentication only — never shared, never marketing. Guest mode collects nothing beyond location (discarded after short-term period).
- Consent and data-handling notice ships from Phase 1.
- **Community pin photos, if they go live for real (Phase 2+ decision), may incidentally capture identifiable people or property.** Phase 1's photo attachment is a local preview only — never uploaded or stored — so this doesn't apply yet, but the consent notice and retention rules must be extended before any real photo upload ships.

**Data retention:**

| Data type | Retention | Reason |
|---|---|---|
| Location (from reports) | Short-term | Geofence validation only |
| Crowd reports | Medium-term | Calibration loop |
| Predictions / alerts | Long-term | Model improvement |
| Device fingerprints | Until user clears | Rate limiting |
| Alerts (issued) | Indefinite | Historical record |
| Community pins | Short-term — auto-expires if not already removed by votes | Reflects current conditions, not a permanent record |
| Pin votes | Tied to parent pin's lifetime | Vote tally only meaningful while the pin is live |

**RA 10173 Article 16 compliance:** data export and deletion endpoints available from Phase 2, associated with device ID. No phone numbers stored.

### Delivery Channels

Push notification is the only proactive channel. This makes push reliability critical.

- **Retry:** if first push attempt fails, service worker retries once after 60 seconds.
- **Mock SMS (demo):** UI shows "SMS sent ✓" to demonstrate fallback path. No real SMS sent. Real provider can be plugged in Phase 3+.
- **Share Alert:** one-tap forward to any installed messaging app. User-initiated — the system doesn't send messages, the user does.
- **Cache fallback:** if all push attempts fail and user hasn't opened app, alert stored in service worker cache, displayed on next open, marked "last known, may be outdated."

### Community Relay

Residents without smartphones are served through a low-tech, high-trust community relay system:

- **Alert captains:** 3–5 residents per zone with smartphones who knock on doors or call neighbors during emergencies. Trusted community members, not system accounts.
- **Printed emergency cards:** zone name, evacuation center, route (with pictogram), hotline, QR code. Distributed during enrollment drives.
- **Enrollment without a smartphone:** alert captain or officer enters zone assignment on their behalf. Resident receives printed card.

This is an operational system, not a technical one — requires coordination with the barangay during pilot.

### Architecture

- **Frontend:** Next.js (App Router), TypeScript strict, RSC-first, feature-based structure
- **UI:** shadcn/ui + Tailwind, High-Contrast theme, dark-mode-default
- **Backend/data:** Supabase — tables for `zones`, `alerts`, `water_level_reports`, `push_subscriptions`, `audit_log`, `evacuation_centers`, `points_of_interest`, `community_pins`, `pin_votes`, `hazard_susceptibility`, `users` (Phase 2); Row Level Security; Server Actions
- **Map:** Leaflet + OpenStreetMap raster tiles — free, no API key, subject to OSM's fair-use tile policy (self-hosted or paid tile provider recommended if traffic grows beyond prototype/pilot scale)
- **Community pins:** citizen-created markers (status tag, caption, optional photo) rendered on the Leaflet map alongside evacuation/POI markers. Phase 1's photo attachment is client-side only — a local preview, never uploaded — so it has no storage cost and works fully offline; real photo storage (Supabase Storage) is a Phase 2+ decision, weighed against its free-tier limits and upload bandwidth during degraded connectivity
- **Routing:** Phase 1 uses pre-authored static routes to each zone's evacuation center only, same as evacuation instructions. Phase 2+ extends routing to essential-service POIs and adds a self-hosted OSRM (Open Source Routing Machine) instance — free — with Dangerous/Hazardous zones modeled as a routing cost penalty, so the "safest route" avoids them rather than just finding the shortest path
- **Offline:** Service worker cache (cache-first for zones/evacuation data; network-first with cache fallback for alerts); Background Sync for offline report submission. Map basemap tiles need live connectivity to load in Phase 1 — offline tile caching for the resident's home zone ships in Phase 2. If no tiles are cached at all (e.g. a fresh install offline), the homepage renders a plain list view of zone alerts instead of a blank map
- **Push:** Web Push API (VAPID keys), service worker handles push events, retries once after 60s
- **SMS (Phase 1 mock):** UI displays "SMS sent ✓"; real provider plugged in Phase 3+
- **Prediction engine:** server-side. Combines rainfall + slope + tides → timing + depth per zone. Conservative thresholds, confidence tagging, calibration loop
- **Cascade warning:** upstream zone alert → downstream "heads-up" before crowd reports arrive
- **Hazard-tile map backdrop:** static per-zone Flood/Landslide/Storm Surge risk (Low/Medium/High), rendered as the map's persistent tile-style backdrop (no drawn zone boundaries) — a client-side area-shading overlay from stored classification data, not a separate raster tile-serving pipeline. Phase 1 mocks this styling for the 3 demo zones; Phase 2+ seeds it from real open Philippine government hazard datasets (DENR-MGB geohazard maps, PAGASA) — free, public, downloaded once and stored in Supabase, not fetched live from any hazard-mapping agency's own service. Live per-zone alert status renders separately as a colored marker, never a fill
- **Auth (Phase 2):** Supabase Auth for optional accounts (email + password). Guest mode default. Admin PIN gate.
- **Data sources:** Philippine weather agency data, satellite rainfall, open government boundaries, open-source maps, open government hazard-susceptibility datasets — all free/public
- **Schema:** `zones` (id, name, boundary_polygon, evacuation info, slope, drainage, downstream_zone_id), `alerts` (id, zone_id, severity, message per-language, source, confidence, predicted_depth, predicted_timing, issued_at, expires_at), `water_level_reports` (id, zone_id, device_id, depth_level, lat/lng, trust_weight, is_outlier, reported_at), `push_subscriptions` (id, zone_id, device_id, endpoint, keys), `audit_log` (id, actor, action, target_id, timestamp, details), `evacuation_centers` (id, zone_id, name, capacity, current_status, updated_at), `points_of_interest` (id, zone_id, category, name, lat, lng), `community_pins` (id, zone_id, device_id, status_tag, caption, photo_url, lat/lng, upvotes, downvotes, created_at), `pin_votes` (id, pin_id, device_id, vote, voted_at), `hazard_susceptibility` (id, zone_id, hazard_type, risk_level, source, updated_at), `users` (Phase 2: id, email, zone_id)

**Auto-trigger rule:** multiple reports from different devices, same zone, within short time window, average depth above threshold → auto-creates alert. Configurable per zone.

**Conservative thresholds (tunable):** low-lying zones get lower thresholds → earlier alerts, fewer reports needed. High elevation zones get higher thresholds → later alerts, more reports needed. Start conservative — "Better to warn and be wrong than miss a real event."

**Confidence tagging:** Estimated (initial, no validation) → Validated (several real events matched) → Calibrated (many events, auto-tuned). Displayed in UI.

**Calibration loop (Phase 3+):** after each real flood event, compare prediction vs actual. Too many false alarms → thresholds shift up. Missed events → thresholds shift down. Auto-adjusts within guardrails.

### Non-Functional Requirements

- Runs on low-end Android devices common in flood-prone areas
- Installable as PWA for reliable offline cache
- Push retry must not block main thread or drain battery
- Comply with RA 10173 consent before any location collection
- UI legible in direct sunlight and in the dark
- Map basemap tiles (the underlying street imagery) require live connectivity to load; fresh imagery isn't cached until Phase 2's offline tile caching ships. The hazard-tile backdrop is different — it's drawn client-side from cached classification data, not fetched as images, so it keeps working offline once that data is cached. Zone/alert/POI data is cached and available offline throughout
- The homepage map's live location dot uses a low-frequency/low-accuracy watch mode, not maximum-accuracy continuous GPS, to limit battery drain during an already power-constrained outage

### Success Metrics

Targets are hypotheses for the pilot, not guarantees.

| Metric | Target |
|---|---|
| Alert reach (enrolled residents receiving alert) | ≥ 90% |
| Outage reach (alerts during no connection) | ≥ 70% |
| Time to delivery (alert created → first delivery) | < 60s |
| Offline usefulness (showing evacuation instructions with no connectivity) | 100% |
| Report validity (passing geofence + rate-limit) | ≥ 85% |
| False-alarm rate (auto-triggered alerts later downgraded) | ≤ 10% |
| Enrollment (households enrolled in pilot barangay) | ≥ 30% |
| Map engagement (sessions reaching alert or evacuation detail via the homepage map within 2 taps) | ≥ 80% |
| Pin removal rate (community pins removed via net-negative voting) | ≤ 15% |

Phase 1 (`hi-fi`) cannot move these — it has no backend and no users. Its exit bar: complete first-run click-through and passing accessibility audit.

### Assumptions

1. **Residents have a smartphone with a modern browser.** Those who don't are served by community relay and printed cards.
2. **Web Push is not guaranteed.** Delivery depends on device, browser, OS. Retry and Share Alert compensate; cached data is final fallback. Real SMS possible in Phase 3+.
3. **Barangay boundary data is accurate enough for geofencing.** PSA boundaries are indicative, not survey-grade; geofence tolerance must be generous.
4. **Hazard susceptibility data is a slow-moving baseline, not current conditions.** Government geohazard maps (e.g. DENR-MGB) are periodically updated, not real-time; the tile backdrop is long-term risk, never confused with the live per-zone status marker.

### Cost Model

**₱0/month.** All infrastructure runs on free tiers.

- Vercel (Hobby) — free
- Supabase (free tier) — ₱0/month
- GitHub — free
- Web Push / VAPID — free
- Map tiles (OpenStreetMap via Leaflet) — free, no API key
- Routing engine, Phase 2+ (self-hosted OSRM) — free to run on a free-tier VM at prototype/pilot request volume
- All data sources — free (open government data, open-source APIs, satellite data)

**Free-tier constraints:** Supabase free projects pause after ~1 week of inactivity (wake before judging). Supabase free tier caps active projects per organization. Vercel Hobby is non-commercial only. OpenStreetMap tile usage must stay within its fair-use policy — not for heavy production traffic without a self-hosted or paid tile provider.

### Implementation Phases

**Phase 1 (`hi-fi`)** — UI only, no backend. Everything mock. [Detailed task breakdown](docs/superpowers/plans/2026-09-01-hi-fi-WeatherWell.md).
- Build: all screens (homepage map with geolocation, a mocked hazard-tile backdrop, zone-status/evacuation/POI/community-pin markers with a client-side-only photo preview, and a pre-authored safest-route path to each zone's evacuation center; alert, evacuation, water-level report form, consent, onboarding, language toggle, hotline, admin simulation) on realistic mock data
- Exit criteria: full mock click-through from fresh first-run, preview link ready, admin demo works

**Phase 2 (`v0`)** — Real data, real offline.
- Build: Supabase schema + RLS (incl. `points_of_interest`, `community_pins`, `pin_votes`, `hazard_susceptibility`), Server Actions, service worker + Background Sync, offline map tile caching for the resident's home zone, self-hosted OSRM routing engine for real safest-route calculation (extended to essential-service POIs, not just evacuation centers), real hazard-tile data seeded from open government geohazard data replacing Phase 1's mock styling, PWA manifest, Supabase Auth, admin PIN gate, decision on whether community pin photos go live for real (Supabase Storage) or stay preview-only
- Exit criteria: app works fully offline on real seeded data. Error/uptime monitoring active. Optional login works.

**Phase 3 (`v1`)** — Core mechanism live.
- Build: threshold engine, Web Push with retry, 3 anti-abuse layers (geofence, rate limit, multi-report) — covering both water-level reports and pin votes — audit trail
- Exit criteria: crowd-report scenario correctly auto-triggers alert and delivers via push with retry

**Final Phase (`mvp`)** — Trust and polish.
- Build: reputation scoring, outlier downweighting, device fingerprint, TTS, calibration loop, field pilot, full accessibility audit
- Exit criteria: full feature set, audit passed, pilot feedback incorporated, submission-ready

### Future Roadmap

- Real water-level sensor hardware integration (schema supports it)
- Multi-language expansion (Cebuano, Ilocano, Hiligaynon)
- Role-based access (if DRRMO officers eventually operate the system)

### Open Risks

- Web Push delivery isn't guaranteed (device/browser dependent) — retry and Share Alert compensate
- RA 10173 compliance stated by design but not legally reviewed — recommend legal review before real deployment
- Non-smartphone users have no direct app access — served only by community relay and printed cards
- Success-metric targets are hypotheses — no baseline from comparable PH deployment yet
- Basemap tiles depend on OpenStreetMap's free fair-use tile policy — not suitable for heavy production traffic without switching to a self-hosted or paid tile provider
- Phase 1's "safest route" is a pre-authored path, not real routing — its accuracy depends on how well the pre-authored paths anticipate real hazard geometry until Phase 2's routing engine ships
- Community pin voting is net-score-gated to resist casual brigading, but a determined actor with several devices can still out-vote genuine reports until real geofence/rate-limit enforcement ships in Phase 3 — Phase 1's vote rule is a UI-only mock, not a real defense
- If community pin photos go live for real in Phase 2+, storage cost, upload bandwidth during degraded connectivity, and RA 10173 exposure (photos may capture identifiable people) all need a decision before shipping — not yet made
