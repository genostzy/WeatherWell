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
| **Admin (developer)** | System operator — issues alerts, edits content, manages infrastructure. Protected by a 4-digit PIN. |
| **Residents** | End users — view alerts, report water levels, view evacuation instructions, share alerts. Guest mode default, no account required. |

### Scope

Software-only prototype. No physical hardware. PWA, not native app.

**Pilot scope:** one real barangay is the deployment target. The app itself is multi-zone from Phase 1 — three mock barangays carry the hi-fi build so zone selection and the "no active alert" state are all exercisable.

**In scope:**
1. Offline-first alert display (PWA with service worker cache)
2. Push notification with retry → mock SMS fallback (demo) → offline cache
3. Pre-authored, per-zone evacuation instructions
4. Crowdsourced water-level reporting with auto-alert trigger
5. Predictive flood timing & depth (confidence-tagged)
6. Cascade early warning (upstream → downstream)
7. Admin simulation & drill mode (6 pre-built scenarios, PIN-protected)
8. Share Alert button (user-initiated forwarding to Messenger/WhatsApp/Viber/SMS)
9. Community relay system + printed emergency cards for non-smartphone residents
10. Optional account with guest-first access (Phase 2)

**Out of scope:**
- Physical water-level sensor hardware
- Dynamic routing engine (zones use static pre-authored routes)

### Target Users

- Residents of flood- and typhoon-prone barangays
- The developer/admin who operates the system

### Design & UX

**shadcn/ui, High-Contrast Utility-First aesthetic. Dark-mode-default.**

- **Dark-mode-default** — OLED screens cut power draw significantly. Battery survival during an outage is a real design constraint.
- **Severity color system is the entire visual language** — Yellow / Orange / Red / Evacuate across alert banners, depth reference, zone map, buttons. One color grammar.
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

### Core Features

1. **Offline-first alert display** — PWA with service worker pre-caches latest alert and evacuation instructions. If connectivity drops, cached data continues showing.

2. **Push notification with retry** — Proactive delivery via Web Push API. Retried once after 60s if first attempt fails. Includes full alert content (severity, zone, depth, evacuation instruction), not just "open the app." Cache fallback if all push attempts fail.

3. **Pre-authored evacuation instructions** — Each zone has static, pre-authored evacuation center and route, bundled ahead of time, not computed live.

4. **Crowdsourced water-level reporting** — Residents report water depth (dry/ankle/knee/waist/neck), geotagged and timestamped. Enough reports crossing a threshold auto-generates a zone alert. Offline reports queue via Background Sync.

5. **Predictive flood timing & depth** — Combines rainfall data, terrain slope, and tidal data to estimate when flooding will reach a zone and how deep it will get. Confidence level shown ("Estimated" until validated).

6. **Cascade early warning** — Upstream zone alert triggers "heads-up" for downstream zones before their own crowd reports arrive.

7. **Zone & hazard maps** — Barangay zone boundaries and evacuation points on a map from static, bundled boundary data.

8. **Zone onboarding** — GPS auto-detects likely zone, manual picker as fallback. Non-smartphone users enrolled by alert captain, receive printed emergency card.

9. **One-tap emergency hotline** — Persistent call button to barangay emergency hotline, independent of connectivity.

10. **Admin simulation & drill mode** — Dedicated `/admin` page with 6 pre-built scenarios. Admin selects zone and scenario, watches full alert flow unfold in real-time with explanation text. PIN-protected.

11. **Share Alert button** — One-tap forward of alert text to any messaging app (Messenger, WhatsApp, Viber, SMS). User-initiated, viral, free.

12. **Optional account** — App works fully without an account (device fingerprint, geofence, local storage). Optional email+password (Phase 2) adds cross-device sync. Guest mode is default, login prompt is dismissible.

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

*Layers 1–3 ship in Phase 3; layers 5–6 ship in Final Phase.*

### Accessibility

Target users are a broad, often vulnerable population under disaster stress.

1. **Language** — Filipino and English baseline; Cebuano in Phase 2 (~20M Visayan speakers). Zone data model stores per-language text for future regional languages.
2. **WCAG AA** — sufficient color contrast, full keyboard navigation, screen-reader labels, minimum touch target size.
3. **Low-literacy design** — evacuation instructions paired with icon/pictogram cues and the depth-reference visual, not text-only.
4. **Audio alerts** — critical alerts can optionally be read aloud (device TTS). Text-based delivery stays primary for deaf/hard-of-hearing users.
5. **Enrollment without barriers** — non-smartphone users served through community relay (alert captains) and printed emergency cards.

### Privacy & Data

Location is personal data under the **Philippines Data Privacy Act of 2012 (RA 10173)**.

- Plain-language consent notice shown before first location request: what's collected, why, how — no pre-ticked boxes.
- Location used only for geofence validation and zone auto-detection, never stored beyond what's needed.
- If account created (Phase 2), email for authentication only — never shared, never marketing. Guest mode collects nothing beyond location (discarded after short-term period).
- Consent and data-handling notice ships from Phase 1.

**Data retention:**

| Data type | Retention | Reason |
|---|---|---|
| Location (from reports) | Short-term | Geofence validation only |
| Crowd reports | Medium-term | Calibration loop |
| Predictions / alerts | Long-term | Model improvement |
| Device fingerprints | Until user clears | Rate limiting |
| Alerts (issued) | Indefinite | Historical record |

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
- **Backend/data:** Supabase — tables for `zones`, `alerts`, `water_level_reports`, `push_subscriptions`, `audit_log`, `evacuation_centers`, `users` (Phase 2); Row Level Security; Server Actions
- **Offline:** Service worker cache (cache-first for zones/evacuation data; network-first with cache fallback for alerts); Background Sync for offline report submission
- **Push:** Web Push API (VAPID keys), service worker handles push events, retries once after 60s
- **SMS (Phase 1 mock):** UI displays "SMS sent ✓"; real provider plugged in Phase 3+
- **Prediction engine:** server-side. Combines rainfall + slope + tides → timing + depth per zone. Conservative thresholds, confidence tagging, calibration loop
- **Cascade warning:** upstream zone alert → downstream "heads-up" before crowd reports arrive
- **Auth (Phase 2):** Supabase Auth for optional accounts (email + password). Guest mode default. Admin PIN gate.
- **Data sources:** Philippine weather agency data, satellite rainfall, open government boundaries, open-source maps — all free/public
- **Schema:** `zones` (id, name, evacuation info, slope, drainage, downstream_zone_id), `alerts` (id, zone_id, severity, message per-language, source, confidence, predicted_depth, predicted_timing, issued_at, expires_at), `water_level_reports` (id, zone_id, device_id, depth_level, lat/lng, trust_weight, is_outlier, reported_at), `push_subscriptions` (id, zone_id, device_id, endpoint, keys), `audit_log` (id, actor, action, target_id, timestamp, details), `evacuation_centers` (id, zone_id, name, capacity, current_status, updated_at), `users` (Phase 2: id, email, zone_id)

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

Phase 1 (`hi-fi`) cannot move these — it has no backend and no users. Its exit bar: complete first-run click-through and passing accessibility audit.

### Assumptions

1. **Residents have a smartphone with a modern browser.** Those who don't are served by community relay and printed cards.
2. **Web Push is not guaranteed.** Delivery depends on device, browser, OS. Retry and Share Alert compensate; cached data is final fallback. Real SMS possible in Phase 3+.
3. **Barangay boundary data is accurate enough for geofencing.** PSA boundaries are indicative, not survey-grade; geofence tolerance must be generous.

### Cost Model

**₱0/month.** All infrastructure runs on free tiers.

- Vercel (Hobby) — free
- Supabase (free tier) — ₱0/month
- GitHub — free
- Web Push / VAPID — free
- All data sources — free (open government data, open-source APIs, satellite data)

**Free-tier constraints:** Supabase free projects pause after ~1 week of inactivity (wake before judging). Supabase free tier caps active projects per organization. Vercel Hobby is non-commercial only.

### Implementation Phases

**Phase 1 (`hi-fi`)** — UI only, no backend. Everything mock. [Detailed task breakdown](docs/superpowers/plans/2026-09-01-hi-fi-WeatherWell.md).
- Build: all screens (alert, evacuation, water-level report form, zone map, consent, onboarding, language toggle, hotline, admin simulation) on realistic mock data
- Exit criteria: full mock click-through from fresh first-run, preview link ready, admin demo works

**Phase 2 (`v0`)** — Real data, real offline.
- Build: Supabase schema + RLS, Server Actions, service worker + Background Sync, PWA manifest, Supabase Auth, admin PIN gate
- Exit criteria: app works fully offline on real seeded data. Error/uptime monitoring active. Optional login works.

**Phase 3 (`v1`)** — Core mechanism live.
- Build: threshold engine, Web Push with retry, 3 anti-abuse layers (geofence, rate limit, multi-report), audit trail
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
