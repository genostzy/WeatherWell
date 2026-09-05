# WeatherWell — Product Requirements

*Challenge: Climate Resilience and Hydrometeorological Disaster Management*

A barangay-scale flood early-warning system built on one idea: **the neighbourhood itself becomes both the delivery network and the sensor network.**

When a typhoon takes out the cell towers, every cloud-based warning system in the country goes quiet at the exact moment it matters. WeatherWell is designed for that moment. Alerts are cached on the device before the outage, forwarded person-to-person when the network is gone, and generated from what residents can see out their own windows — a zero-hardware substitute for water-level sensors no barangay can afford.

---

## How to read this document

This PRD describes **what WeatherWell is and how it works** — the design, not a snapshot of today's code. It is written to stay true as the build progresses.

Everything about the current state of implementation lives in one place: **[Build Status](#build-status)**, dated and versioned. That separation is deliberate. Adding a capability changes one row in that table; it does not make any other statement in this document false, because nothing else here claims a feature is absent.

Two naming notes, so this document and the submitted IDEA read consistently:

- The IDEA document's **"Phase 1 (this challenge)"** means the challenge deliverable *as a whole* — the PWA with offline alerts, evacuation guidance, push with retry, and crowdsourced reporting. This document breaks that same deliverable into the four build stages IDEA names ("hi-fi prototype first, then functional build, full implementation, and final testing"). To avoid a collision, those are called **Stages 1–4** here, never "Phase 1."
- Where IDEA says **DRRMO**, this document says **operator**. Same people; see [Who It Serves](#who-it-serves).

---

## The Problem

The Philippines averages roughly twenty tropical cyclones a year. Four failures compound during each one:

**Connectivity dies when warning matters most.** Existing early-warning systems assume a live connection to reach people. Infrastructure damage severs internet and cellular service precisely during the event they were built to warn about.

**National data isn't local enough.** Bulletins warn by province. A resident needs to know whether *this street* floods and whether to leave *now* — a translation nobody performs at barangay scale.

**Sensors cost more than barangays have.** Real-time water-level hardware is priced out of reach for the communities that need it most, so the ground truth simply doesn't exist.

**Officers have nowhere to practise.** Disaster officers get no safe environment to rehearse issuing an alert and coordinating an evacuation before a real event forces them to do it live.

---

## The Solution

Three mechanisms, each answering one of the failures above.

### 1. Multi-channel alert delivery that survives the outage

Alerts travel over live internet first, as a push notification with one retry after 60 seconds. If push fails, a mock-SMS fallback path demonstrates carrier-independent delivery. If everything fails, the alert is already cached on the device from before the outage and displays on next open, clearly labelled as last-known and possibly outdated.

The final channel is human: a **Share Alert** button forwards the alert text into Messenger, WhatsApp, Viber, or SMS through the resident's own apps. The system never sends these — the resident does — which is what lets an alert keep moving through a network the system itself can no longer reach.

All of that rests on one precondition: the app has to already be on the phone. Caching cannot help someone who first reaches for the app during the storm, because that is exactly when it can no longer be downloaded. So **onboarding ends by asking the resident to install it**, and makes that argument rather than the usual invitation — the moment this is needed is the moment it becomes unobtainable. The ask is real where the browser supports one and honest where it does not: browsers that expose an install event get a genuine dialog, iPhones get the Share-sheet steps because iOS has no programmatic install, and anyone already running the installed app is not asked. It never blocks — a resident who declines still reaches the app, and can install later from their browser's own menu.

### 2. Street-level evacuation guidance

Every zone carries pre-authored evacuation instructions naming a specific centre and route, bundled ahead of time rather than computed live, so they work with no connectivity at all. Centre capacity shows as plain language — space available, limited, full — derived from a real headcount-to-capacity ratio when one is being tracked, so residents see actual spots remaining rather than a status word someone set by hand.

A **safest-route** action recommends a path that avoids zones currently rated Dangerous or Hazardous rather than simply the shortest one, and never names an evacuation centre that sits inside one — a clear path is no use if it ends somewhere being evacuated. Alongside it, a live compass bearing and distance ("700m NE to Nilombot Elementary School") updates as the resident moves — straight-line direction, explicitly labelled as such, not a walkable path.

All of this renders inside WeatherWell's own map. There is deliberately **no "open in Google Maps" handoff**, at any stage: a generic map has no idea which zones this system currently considers hazardous, and would happily route someone straight through one. Where every available path crosses a hazardous zone, the route is still shown as the best option available but visibly flagged — never presented as safe when it isn't.

### 3. Crowdsourced water-level sensing

Residents report flood depth against a visual reference anyone can use without training: **dry, ankle, knee, waist, neck**. Enough independent, agreeing reports in one zone cross a threshold and auto-generate an alert.

This is the zero-hardware substitute for sensors. It scales instantly, costs nothing to deploy, and improves as more residents participate — but it inherits the trust problem that comes with any crowdsourced input, which is why [Anti-Abuse](#anti-abuse) is a first-class part of the design rather than an afterthought.

### What makes this different

Philippine tools already exist — national hazard maps, flood dashboards, cell broadcast, crowdsourced flood-report apps. Every one of them still assumes a live connection, either to reach people or to collect data. WeatherWell is built for the case where that assumption fails, and complements official sources by solving two specific problems at the moment their usual channels go dark: **distribution** and **ground truth**.

---

## How This Answers the Challenge

The challenge names three failures. Each maps to one of the mechanisms above — and each row also says how far it has actually been built, because "designed for" and "working today" are different claims and only one of them is worth trusting in an emergency.

| The challenge's problem | WeatherWell's answer | Where it stands |
|---|---|---|
| Infrastructure collapse severs internet and cellular service, leaving centralised cloud early-warning inaccessible exactly when it is needed | Content is pre-positioned on the device *before* the outage, and the last delivery channel is a person: Share Alert pushes the alert text into the resident's own Messenger, Viber or SMS, so a warning keeps moving through a network the system itself can no longer reach. | Caching, the install prompt that makes caching possible, and Share Alert are all built and work with no connection. Real push delivery, and a real backend to have cached *from*, are Stages 2–3. |
| Communities struggle to translate broad national weather data into actionable, street-level evacuation protocols | Every zone carries a pre-authored evacuation centre and route. PAGASA's own Yellow/Orange/Red vocabulary is carried through so the wording matches what residents hear on radio and TV, then rendered as a plain-language status with one concrete action step, plus a depth reference drawn for an adult and a child rather than stated as a number. | Built end to end across four barangays. The translation is performed once by a person ahead of time: the app supplies the structure, the delivery and the offline guarantee, while the barangay supplies the local knowledge. |
| No affordable, localised water-level sensors for real-time alerts | The community *is* the sensor network. Residents report depth against dry / ankle / knee / waist / neck, and enough independent, agreeing reports in one zone cross a threshold and raise an alert — no hardware, immediate coverage, and better the more people take part. | The reporting flow, the agreeing-report count and the threshold display are built, as is the per-device identity that limits casual abuse. The rest of what makes crowd data trustworthy is not: geofence and rate limit arrive in Stage 3 and reputation scoring in Stage 4, and while outlier downweighting behaves correctly, the flag it acts on is fixture data rather than something detected. This clause is answered in principle and demonstrated as an interaction, not yet enforced. |

**On depending on a cloud backend.** Stage 2 introduces Supabase, which is centralised — the same category of system the challenge says fails. The distinction is what each part is responsible for: the cloud authors and aggregates, while *delivery* survives without it. A resident who has opened the app once already holds the alert, the evacuation instructions and the route on their own device, and from that point the network is optional and other people are the transport. Nothing in the design requires a resident to reach a server during the event itself.

**What this does not solve.** It does not restore connectivity, and it does not replace official warnings — it complements PAGASA rather than competing with it. A resident who first installs the app during the typhoon, having never opened it before and with no signal, gets nothing from it; the community relay and the printed emergency cards exist for exactly that person, and they are an operational system requiring barangay coordination, not something software can deliver alone.

---

## Who It Serves

| Audience | How they use it |
|---|---|
| **Residents** of flood-prone barangays | View alerts, report water levels, follow evacuation guidance, share alerts onward. Guest mode by default — no account required. |
| **Operators** — the barangay's disaster officer (DRRMO) or a designated administrator | Issue and override alerts, track evacuation headcounts, moderate community reports, rehearse in drill mode. |
| **Non-smartphone residents** | Reached through the community relay and printed emergency cards, not the app UI directly. |

**On roles and access control.** The system models exactly two roles — operator and resident — with no per-officer accounts and no role-based permission tiers. This is a scale decision, not a statement about who operates it: one barangay pilot has one operator, and inventing a permission hierarchy for a single user would be complexity without a beneficiary. The operator role is precisely the DRRMO function IDEA describes. Multi-officer LGU deployments would need real per-user authentication, permissions, and audit requirements — that is a genuine future expansion, noted in [Scope Boundaries](#scope-boundaries).

---

## How It Works

### The alert pipeline

An alert reaches a resident by one of three routes, tried in order:

```
crowd reports cross threshold ─┐
prediction engine forecast ────┼─→ alert created ─→ operator review ─→ push (retry once at 60s)
upstream cascade warning ──────┘                                    ├─→ SMS fallback
                                                                    └─→ device cache
```

**Auto-trigger rule.** Multiple reports, different devices, same zone, within a short time window, average depth above threshold. Configurable per zone.

**Conservative thresholds, tunable per zone.** Low-lying zones get lower thresholds — earlier alerts, fewer reports needed. Higher ground gets higher thresholds. The bias is deliberate and stated: *better to warn and be wrong than to miss a real event.*

**Confidence tagging.** Estimated (no validation yet) → Validated (several real events matched) → Calibrated (many events, auto-tuned). Always shown in the UI, never hidden behind a number that implies more certainty than exists.

**Calibration loop.** After each real flood event, prediction is compared against what actually happened. Too many false alarms shifts thresholds up; missed events shift them down. Auto-adjusts within guardrails.

### Prediction and cascade

The prediction engine combines rainfall, terrain slope, and tidal data to estimate when flooding reaches a zone and how deep it gets. **Cascade warning** uses geography directly: an upstream zone's alert raises a heads-up downstream *before* those residents' own reports arrive, buying the lead time that matters most.

### Human override — the spine of the whole design

Auto-triggered alerts are a fast first response, never the final word. The operator can confirm, downgrade, or cancel any automated alert, and can remove or restore any community pin. Every automated signal in this system is explicitly advisory to a human decision.

This is why the computed risk score is displayed as advisory only and drives nothing, and why community pins can never auto-promote themselves into an official alert. When an alert is downgraded, residents see it stated plainly — *"Alert downgraded — water levels below threshold"* — rather than having it silently disappear.

### Anti-Abuse

Crowdsourced reporting's biggest risk is fake data. Ten layers, defence in depth:

| # | Layer | What it does |
|---|---|---|
| 1 | Geofence check | Report's GPS must fall inside the claimed zone, with generous per-zone tolerance |
| 2 | Rate limiting | One report per device per short window |
| 3 | Multi-report threshold | No single report triggers an alert; several independent, agreeing ones must arrive |
| 4 | Outlier downweighting | A report disagreeing sharply with nearby ones is discounted, not deleted |
| 5 | Device fingerprint | Random device ID raises the cost of abuse |
| 6 | Reputation scoring | Devices whose past reports matched verified outcomes count for more. Self-correcting |
| 7 | **Human override** | Operator can confirm, downgrade, or cancel any auto-triggered alert |
| 8 | Audit trail | Every report retained with timestamp, location, device ID for later review |
| 9 | Transparent downgrade | Downgrades are shown, never silent |
| 10 | Pin vote protection | Pin votes reuse layers 1, 2 and 5. Removal triggers on **net score** — downvotes exceeding upvotes by 5 — so a well-corroborated pin survives a handful of bad-faith downvotes |

Removals are **soft deletes**, both the vote-driven and operator kind, so a pin taken down wrongly by a brigading attack can be restored. That is layer 7's principle applied to community content.

### Community relay

Residents without smartphones are served by a low-tech, high-trust human system — coordinated with the barangay, not built in software:

- **Alert captains** — three to five residents per zone with smartphones who knock on doors or call neighbours during an emergency. Trusted community members, not system accounts.
- **Printed emergency cards** — zone name, evacuation centre, route with pictogram, hotline, QR code. Distributed during enrolment drives. The app generates these; the distribution is operational.
- **Enrolment without a smartphone** — an alert captain or officer enters the zone assignment on the resident's behalf.

---

## The Resident Experience

**shadcn/ui, high-contrast, utility-first. Dark-mode default.**

- **Dark-mode default** — OLED screens cut power draw. Battery survival during an outage is a real design constraint, not a style preference.
- **The homepage is the map.** Top to bottom: personal status headline, a collapsed Current Conditions panel, then the full-bleed map. Alert detail, water-level reporting, and evacuation instructions are one tap from any marker.
- **Progressive disclosure** — a stressed user sees the next needed action, not a dashboard. Weather readings are useful but not urgent, so they don't compete for first-glance attention.
- **Large targets, minimal text** — one-handed, injured, or shaking-hand use. Short plain-language fragments.
- **No decorative chrome** — thick borders over soft shadows, because shadows vanish in direct sunlight. System fonts only.
- **No drawn zone boundaries.** Baseline risk is a continuous hazard-tile backdrop; live status is a marker on top. Boundary data still exists and is still needed for geofencing — this removes boundaries from the *map's rendering*, not the data model. It avoids implying false precision at a zone's edges.
- **Checked in dim light and at arm's length**, not only in a bright design tool.

### Built to load on a bad connection

The visual restraint above is not only a legibility choice — it is a performance budget, because the device this has to work on is a low-end Android phone on a degraded network during a power cut.

- **No web fonts.** The system font stack only, so nothing blocks first paint waiting on a download.
- **No charting library.** The admin trend views are hand-drawn SVG and CSS. A charting dependency is weight these phones cannot spare, for output that is a few polylines.
- **No hero imagery, video, or decorative media.** The only images in the interface are icons and a resident's own locally-attached photo.
- **Motion is limited to small interface transitions** — a dialog opening, a tooltip appearing. Nothing animates the content itself, and nothing is doing continuous work while a resident is reading an alert.
- **The map is the one heavy dependency**, and it is loaded lazily rather than in the initial bundle, with a plain zone-alert list as the fallback when tiles cannot load at all.

Measured on the deployed build, a first visit transfers roughly **230 KB compressed** across twelve files. That is the cost of arriving at the app with nothing cached; every subsequent visit is served from the device.

### Severity is one visual language

| Severity | Label | Hex | Contrast |
|---|---|---|---|
| `yellow` | Advisory | `#eab308` | 10.9:1 |
| `orange` | Watch | `#f97316` | 7.5:1 |
| `red` | Warning | `#dc2626` | 4.8:1 |
| `evacuate` | Evacuate Now | `#7f1d1d` | 10.0:1 |

Alert copy deliberately mirrors PAGASA's own Rainfall Warning vocabulary — Yellow, Orange, Red are the same three colours PAGASA uses on TV and radio. WeatherWell's "Evacuate Now" tier sits *above* that scale rather than pretending to be a fourth PAGASA colour. A resident should never have to reconcile two competing vocabularies mid-emergency.

### The map legend is a plain-language reading of the same scale

| Map label | Meaning | Severity | Colour |
|---|---|---|---|
| Safe | No active alert | *(zero-state, not a severity)* | Green `#22c55e` |
| Cautionary | Early-stage risk | `yellow`, `orange` | Yellow / Orange |
| Dangerous | Active flooding | `red` | Red |
| Hazardous | Evacuate now | `evacuate` | Dark red |

Four plain-language labels for at-a-glance reading. This is a legend simplification, not a second severity scale. Status markers **pair a shape or icon with colour**, never colour alone, so colourblind residents can read them.

### Depth maps one tier hotter than it looks

| Depth | Approx. | Maps to |
|---|---|---|
| `dry` | 0 cm | yellow |
| `ankle` | 15 cm | orange |
| `knee` | 45 cm | red |
| `waist` | 90 cm | **evacuate** |
| `neck` | 150 cm | **evacuate** |

Both `waist` and `neck` mean evacuate — shifted one tier earlier than a naive linear mapping. The reason is the depth-reference visual itself: adult (170cm) and child (110cm) silhouettes on a shared ground line under one waterline. "Waist" on the adult scale is already near a child's shoulders. Waiting for the most extreme adult-scale reading before calling for evacuation would already be too late for the more vulnerable person standing in the same water.

---

## Accessibility & Inclusion

Target users are a broad, often vulnerable population operating under disaster stress.

1. **Language** — Filipino and English from the start. Cebuano (~20M speakers) next, then the rest of the ten most-spoken Philippine languages as translation capacity allows: Ilocano, Hiligaynon, Waray, Bikol, Kapampangan, Pangasinan, Maranao, Maguindanao. This is a translation effort, not an engineering one — the localisation layer falls back to English per-string, so a language can ship with only the safety-critical strings done first (alerts, evacuation instructions, hotline) rather than waiting for full coverage.
2. **WCAG 2.1 AA** — sufficient contrast, full keyboard navigation, screen-reader labels, minimum touch-target sizes, and no color-only signalling anywhere.
3. **Low-literacy design** — evacuation instructions paired with pictogram cues; the depth reference is a picture, not a number.
4. **Audio alerts** — critical alerts optionally read aloud via device TTS. Text delivery stays primary for deaf and hard-of-hearing users.
5. **Enrolment without barriers** — the community relay and printed cards exist so that owning a smartphone is not a precondition for being warned.

---

## Privacy & Data

Location is personal data under the **Data Privacy Act of 2012 (RA 10173)**.

- Plain-language consent before the first location request — what is collected, why, and how. No pre-ticked boxes. A resident can decline and still see public alerts.
- Location is used for geofence validation and zone auto-detection only, never retained beyond that purpose.
- **The map's location dot is continuous, and consent says so.** While the map is open, position is tracked at low frequency to drive the direction-to-safety indicator, and stops when the map closes. It is never stored — it exists in memory only. The consent notice covers this separately from the one-time fetch used for zone detection.
- Guest mode collects nothing beyond location. If an account is created, the email is for authentication only — never shared, never marketing.
- **Community pin photos may incidentally capture identifiable people or property.** Consent and retention rules must be extended before any real photo upload ships.

**Retention**

| Data | Retention | Reason |
|---|---|---|
| Location (from reports) | Short-term | Geofence validation only |
| Crowd reports | Medium-term | Calibration loop |
| Predictions / alerts | Long-term | Model improvement |
| Device fingerprints | Until user clears | Rate limiting |
| Alerts issued | Indefinite | Historical record |
| Community pins | Short-term, auto-expiring | Reflects current conditions, not a permanent record |
| Pin votes | Tied to parent pin | Tally only meaningful while the pin is live |

**RA 10173 Article 16** — data export and deletion, keyed to device ID. No phone numbers stored.

---

## Architecture

**Frontend** — Next.js App Router, TypeScript strict, feature-based structure. shadcn/ui with Tailwind.

**Backend** — Supabase: Postgres with Row Level Security, Server Actions, and Auth for optional accounts. Core tables: `zones`, `alerts`, `water_level_reports`, `push_subscriptions`, `audit_log`, `evacuation_centers`, `points_of_interest`, `community_pins`, `pin_votes`, `hazard_susceptibility`, `evacuation_check_ins`, `users`.

**Map** — Leaflet with OpenStreetMap raster tiles: free and key-less, subject to OSM's fair-use policy. Self-hosted or paid tiles are the answer if traffic outgrows pilot scale.

**Offline** — a service worker choosing its strategy per kind of request rather than applying one rule to everything. Zone and evacuation data is cache-first, because surviving an outage is the point. Alerts are network-first, because a stale alert is worse than a slow one. Pages are network-first with a short timeout, so a good connection gets the current build while a degraded one still falls back to cache almost immediately. Content-hashed build assets are cache-first, since a change there produces a new URL. Reports submitted offline queue via Background Sync.

Cache names carry a version that is bumped on deploy, and activation deletes anything not on the current list. This is what lets a fix reach a device that has already installed the app: without it, a cache-first shell pins a resident to whatever build they first received, and a correction to alert logic could never reach the people relying on it. The zone-data cache is deliberately exempt from that versioning, so a device that updates and then loses signal still has its evacuation instructions.

Basemap tiles need connectivity until per-zone tile caching ships; with no tiles cached at all, the homepage degrades to a plain list of zone alerts rather than a blank map.

**Push** — Web Push API with VAPID keys; the service worker handles push events and retries once after 60 seconds.

**Routing** — pre-authored static routes to each zone's evacuation centre, plus a client-side bearing/distance calculation (haversine, pure arithmetic, no engine). A self-hosted OSRM instance later extends this to real path-finding with hazardous zones modelled as a routing cost penalty.

**Charts** — hand-drawn SVG and CSS, no charting library. This ships to low-end phones and a charting dependency is weight those devices cannot spare.

**Risk score** — a clamped 0–100 per-zone score from four weighted signals (rainfall trend 40%, crowd reports 30%, flood hazard baseline 20%, upstream cascade 10%), with a confidence ladder and a trend direction. Deliberately scoped to *scoring only*: pure client-side arithmetic, no I/O, displayed as one advisory tile. It decides nothing — alert severity always comes through the operator-override-aware path. Extending it into a full decide/deliver/feedback pipeline is deferred until the open design questions are resolved.

### Data sources

All free and public: PAGASA bulletins (rainfall, wind, typhoon track, thunderstorm watch, heat index, drought outlook), satellite rainfall, open government boundaries, OpenStreetMap, and open government hazard-susceptibility datasets (DENR-MGB geohazard maps).

**PAGASA sourcing strategy, in order of preference:**

1. **PAGASA's own APIs.** A Ten-Day Forecast API and a Seasonal Forecast API exist, documented in a CGIAR review of PAGASA's API for the Climate+ agro-advisory programme. They are not self-serve — access runs through PAGASA's formal data-request process. A barangay pilot with LGU backing has legitimate standing to ask, and the process is slow, so the request should open early rather than be treated as a late integration task.
2. **PAGASA's public file server** (`pubfiles.pagasa.dost.gov.ph`) — an open, unauthenticated directory of date-prefixed PDF bulletins, actively maintained, covering drought assessments and weather advisories. Polling stable file paths is materially more durable than parsing rendered HTML and carries no third-party dependency.
3. **Established community wrappers, used strictly as a client.** For tropical cyclone bulletins, `pagasa-parser-web` is the mature option. It is **AGPL-3.0**, and that licence's network clause reaches anything run as a service on top of it: calling the maintainer's hosted instance over HTTP leaves this codebase unaffected, while self-hosting or forking would pull the surrounding service into AGPL. It is also volunteer-run with no uptime or rate-limit commitment, so it sits behind the same cache-and-degrade behaviour as push delivery, and must not be polled hard during the typhoon peak when its traffic and ours spike together.
4. **Our own ingestion, built last and deliberately** — server-side and scheduled, never scraped per-request from a resident's device — only where options 1–3 don't reach.

**No programmatic source has been identified for heat index.** If one cannot be secured, the panel should drop that reading rather than display a stale or invented value.

---

## Non-Functional Requirements

- Runs on low-end Android devices, which is what flood-prone barangays actually own.
- Installable as a PWA for reliable offline caching.
- Push retry must not block the main thread or drain battery.
- Location consent obtained before any collection, per RA 10173.
- Legible in direct sunlight and in the dark.
- The live location watch uses low-frequency, low-accuracy mode rather than continuous maximum-accuracy GPS, to limit battery drain during an already power-constrained outage.
- Readings refresh at different rates and the UI must show each reading's own age rather than implying everything is equally live.

---

## Build Status

**As of 4 September 2026 · Stage 1 (`hi-fi`) complete.**

This table is the single source of truth for implementation state. Everything above describes the design; this describes what exists today.

| Capability | Status | Note |
|---|---|---|
| All resident and operator screens | **Built** | 9 routes, full first-run click-through |
| Bilingual UI (English / Filipino) | **Built** | Every user-facing string, including screen-reader labels, goes through the localisation layer |
| Onboarding, consent, zone selection | **Built** | GPS auto-detect is a stub — proposes a zone to confirm; real matching needs boundary polygons |
| Install prompt at the end of onboarding | **Built** | Uses the browser's real install dialog where one exists; explains the Share-sheet route on iOS, which has none. Skippable, and not shown to an already-installed device |
| Homepage map, live position, markers, legend | **Built** | Leaflet with hazard backdrop and POI markers |
| Community pins — create, edit, delete, vote, moderate | **Built** | Photos are a local preview, never uploaded |
| Water-level reporting, recent reports, anti-abuse explainer | **Built** | Reports persist locally |
| Evacuation guidance, capacity from headcount, resident check-in | **Built** | Check-in is a self-report — no verification, no responder delivery |
| Safest route + live bearing/distance | **Built** | Routes pre-authored; bearing is client-side maths |
| Operator dashboard, analytics, per-zone view, operations map | **Built** | Includes advisory risk score |
| Drill/simulation mode | **Built** | 6 scenarios; notifies nobody |
| Printed emergency card | **Built** | |
| PWA manifest + service worker cache | **Built** | |
| Human override (layer 7) | **Built** | Real today — severity, centre-status and occupancy overrides persist |
| Device fingerprint (layer 5) | **Built** | Random per-device ID, real today — it already gates one-vote-per-device and own-pin editing. Hardening against deliberate clearing comes later |
| Pin vote protection (layer 10) | **UI only** | Net-score rule and one-vote-per-device work; the geofence and rate limit it also depends on (layers 1, 2) do not |
| All data | **Mock** | Four demo barangays; no backend |
| Backend, auth, operator PIN | **Not started** | Stage 2 |
| Real push delivery, SMS provider | **Not started** | Stage 3. The service worker's receive-and-display handler exists, but there is no subscription, no VAPID keys and nothing that sends |
| Geofence, rate limit, audit trail (layers 1–3, 8) | **Not started** | Stage 3 |
| Outlier downweighting (layer 4) | **UI only** | Downweighting behaviour is real — flagged reports are excluded from the agreeing count and badged — but the flag itself is set in fixture data, not detected |
| Reputation scoring (layer 6) | **Not started** | Stage 4 — a trust weight exists on the data model but nothing reads it |
| Real PAGASA and hazard data | **Not started** | Stage 2 |
| Offline map tile caching | **Not started** | Stage 2 |
| Offline fallback when the map cannot draw | **Built** | Degrades to a plain zone-alert list. Uses connectivity as a Stage 1 proxy for "are tiles available" |

---

## Roadmap

IDEA describes this challenge as "hi-fi prototype first, then functional build, full implementation, and final testing." Those are the four stages below.

### Stage 1 — `hi-fi` · Prototype
Every screen, on realistic mock data, no backend.

**Done when:** a complete first-run click-through works from a cleared device, the operator demo is presentable, the automated accessibility sweep passes, and a review of the whole branch has been run with every finding resolved.

**Status: complete.** The click-through was walked end to end from cleared storage across all nine routes. Continuous integration runs lint, type-checking, the test suite, an unused-code check and a production build on every push. The branch review raised seven correctness findings — five of them the same defect, where an operator's decision was not fully honoured downstream of the control that made it — and each is fixed with either a regression test proven to fail against the old behaviour, or a function signature that makes the mistake a compile error rather than a silently wrong answer.

That last criterion is deliberately part of the bar rather than a note. Every item on the build list existed before the review, and the build still contained a path that showed residents "Evacuate immediately" under an "Advisory" badge. "Everything is built" and "everything works" are different claims, and only the second is worth making about a warning system.

### Stage 2 — `v0` · Functional build
Real data and real offline capability. Supabase schema with Row Level Security, Server Actions, Auth, and the operator PIN gate. Service worker with Background Sync. Offline map tiles for the resident's home zone. Self-hosted OSRM for real safest-route calculation. Real PAGASA readings and real hazard data replacing the mocks. A decision on whether pin photos go live.

**Done when:** the app works fully offline on real seeded data, optional login works, the operator PIN gate is live, and error/uptime monitoring is active.

> The PIN gate ships **in this stage, alongside the database — not after it.** Today `/admin` is unauthenticated and that is genuinely harmless: every override writes to the visitor's own device, so a stranger who opens it can only change what they themselves see. The moment a shared backend exists, that same unauthenticated screen can change what a whole barangay is told during a flood. The protection has to arrive with the thing that creates the risk, which is why it is an exit criterion rather than a task on a list.

> Start the PAGASA data request at the *beginning* of this stage. It gates the highest-quality data option and moves on an institutional timeline, not ours.

### Stage 3 — `v1` · Full implementation
The core mechanism goes live: threshold engine, Web Push with retry, anti-abuse layers 1–3 and the audit trail, and the analytics dashboard rewired from mock data onto that real audit trail.

**Done when:** a genuine crowd-report scenario auto-triggers an alert and delivers it via push with retry — end to end, no mocks in the path.

### Stage 4 — `mvp` · Final testing
Reputation scoring, outlier downweighting, device-fingerprint hardening, TTS, the calibration loop, and a field pilot.

**Done when**, measurably:
- Anti-abuse layers 1–6 are all live and a documented abuse-attempt test suite passes against them.
- The calibration loop has run against at least one real event, with prediction-versus-actual recorded.
- A full WCAG 2.1 AA audit passes with no outstanding violations.
- The pilot barangay has completed at least one drill using the system, and the resulting feedback is either incorporated or explicitly logged as deferred.

---

## Measuring Success

Targets are hypotheses for the pilot, not guarantees — no baseline exists from a comparable Philippine deployment.

| Metric | Target |
|---|---|
| Alert reach (enrolled residents receiving an alert) | ≥ 90% |
| Outage reach (alerts delivered with no connection) | ≥ 70% |
| Time to delivery (created → first delivery) | < 60s |
| Offline usefulness (evacuation instructions with no connectivity) | 100% |
| Report validity (passing geofence + rate limit) | ≥ 85% |
| False-alarm rate (auto-alerts later downgraded) | ≤ 10% |
| Enrolment (households in the pilot barangay) | ≥ 30% |
| Map engagement (sessions reaching alert or evacuation detail within 2 taps) | ≥ 80% |
| Pin removal rate (pins removed by net-negative voting) | ≤ 15% |

**These require real users and a real backend, so Stages 1 and 2 cannot move them.** Each earlier stage is measured on its own exit criteria instead, which is why those are written to be falsifiable.

---

## Scope Boundaries

**Committed** — everything in [How It Works](#how-it-works) and [The Resident Experience](#the-resident-experience).

**Explicitly out of scope**

- Physical water-level sensor hardware. The schema supports it; the product does not depend on it.
- A live routing engine in Stage 1 — routes are pre-authored per zone, exactly like evacuation instructions.
- Climate adaptation planning tools for infrastructure, agriculture, or water management. Different audience (government planners) and different timescale (months and years) than this system's live-event focus.

**Future expansion, deliberately deferred**

- **Role-based access for multi-officer LGU deployments.** A reversal of the two-role model, and not a small one — real authentication, permissions, and audit requirements come with it.
- **Active early warning for landslide, storm surge, drought, and heatwave** — meaning their own crowd reports, thresholds, and response coordination. Note this is *not* the same as what already ships for those hazards: landslide and storm surge carry a static risk rating, heat and drought a read-only bulletin. Both are informational. Going from informational to active would need a separate data model and crowd-report vocabulary for each — there is no landslide equivalent of the ankle/knee/waist/neck scale — making them parallel products rather than extensions of the flood engine.

### How new scope gets admitted

This document is expected to grow. A proposed capability belongs in WeatherWell if it can answer yes to all four:

1. **Does it serve the outage case?** The differentiator is working when connectivity fails. Features that assume a live connection compete with existing tools.
2. **Does it work at barangay scale with one operator?** No feature may assume a staffed operations centre.
3. **Does it degrade safely?** Every capability needs a defined behaviour when data is stale, absent, or wrong — and must never present a guess as a certainty.
4. **Does a human stay in the loop for anything that tells a resident to move?** Automated signals are advisory. This is not negotiable.

A capability meeting all four can be added to the design without contradicting anything in this document; it appears in [Build Status](#build-status) when it ships.

---

## Risks & Open Questions

- **Web Push delivery is not guaranteed** — it varies by device and browser. Retry, cache fallback, and Share Alert exist specifically because this channel cannot be trusted alone.
- **RA 10173 compliance is stated by design but not legally reviewed.** A legal review is recommended before any real deployment.
- **Non-smartphone residents have no direct app access.** They depend entirely on the community relay and printed cards — an operational system requiring barangay coordination, and therefore the part of the design most likely to fail for reasons outside the software.
- **Success-metric targets are unvalidated hypotheses.** No comparable Philippine deployment provides a baseline.
- **No programmatic heat-index source has been found.** The reading should be dropped rather than faked if one cannot be secured.
- **PAGASA's formal data-request process has an unknown timeline** and gates the best data option, which is why it opens at the start of Stage 2 rather than the end.
- **`pagasa-parser-web` is volunteer infrastructure** with no uptime commitment, and its load peaks at exactly the moment ours does.
