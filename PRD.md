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

Four mechanisms, each answering one of the failures above.

### 1. Multi-channel alert delivery that survives the outage

Alerts travel over live internet first, as a push notification with one retry after 60 seconds. If push fails, a mock-SMS fallback path demonstrates delivery that does not depend on the data network — SMS rides the cellular voice/signalling path, which routinely survives when mobile data does not. If everything fails, the alert is already cached on the device from before the outage and displays on next open, clearly labelled as last-known and possibly outdated.

The final channel is human: a **Share Alert** button forwards the alert text into Messenger, WhatsApp, Viber, or SMS through the resident's own apps. The system never sends these — the resident does — which is what lets an alert keep moving through a network the system itself can no longer reach.

All of that rests on one precondition: the app has to already be on the phone. Caching cannot help someone who first reaches for the app during the storm, because that is exactly when it can no longer be downloaded. So **onboarding ends by asking the resident to install it**, and makes that argument rather than the usual invitation — the moment this is needed is the moment it becomes unobtainable. The ask is real where the browser supports one and honest where it does not: browsers that expose an install event get a genuine dialog, iPhones get the Share-sheet steps because iOS has no programmatic install, and anyone already running the installed app is not asked. It never blocks — a resident who declines still reaches the app, and can install later from their browser's own menu.

### 2. Street-level evacuation guidance

Every zone carries pre-authored evacuation instructions naming a specific centre and route, bundled ahead of time rather than computed live, so they work with no connectivity at all. Centre capacity shows as plain language — space available, limited, full — derived from a real headcount-to-capacity ratio when one is being tracked, so residents see actual spots remaining rather than a status word someone set by hand.

A **safest-route** action recommends a path that avoids zones currently rated Dangerous or Hazardous rather than simply the shortest one, and never names an evacuation centre that sits inside one — a clear path is no use if it ends somewhere being evacuated. Alongside it, a live compass bearing and distance ("700m NE to Nilombot Elementary School") updates as the resident moves — straight-line direction, explicitly labelled as such, not a walkable path.

All of this renders inside WeatherWell's own map. There is deliberately **no "open in Google Maps" handoff**, at any stage: a generic map has no idea which zones this system currently considers hazardous, and would happily route someone straight through one. Where every available path crosses a hazardous zone, the route is still shown as the best option available but visibly flagged — never presented as safe when it isn't.

### 3. Crowdsourced water-level sensing

Residents report flood depth against a visual reference anyone can use without training: **dry, ankle, knee, waist, neck**. Enough independent, agreeing reports in one zone cross a threshold and auto-generate an alert.

This is the zero-hardware substitute for sensors. It scales instantly, costs nothing to deploy, and improves as more residents participate — but it inherits the trust problem that comes with any crowdsourced input, which is why [Anti-Abuse](#anti-abuse) is a first-class part of the design rather than an afterthought.

### 4. A place to rehearse before it is real

The first time an officer issues an evacuation order should not be during an evacuation. **Drill mode** replays six scenarios end to end — prediction, alert issued, push sent, push failing, SMS fallback, cache, downstream cascade — on the operator's real dashboard, against real zones, with every step timed the way it would actually unfold.

It notifies nobody. That is the point: the operator practises the decisions and the sequence without a single resident's phone lighting up, and can do it as often as they like at no cost and no risk. It doubles as the honest way to demonstrate the alert pipeline before any of it is wired to a real sender, which is why it is also how this build is shown.

### What makes this different

Philippine tools already exist — national hazard maps, flood dashboards, cell broadcast, crowdsourced flood-report apps. Every one of them still assumes a live connection, either to reach people or to collect data. WeatherWell is built for the case where that assumption fails, and complements official sources by solving two specific problems at the moment their usual channels go dark: **distribution** and **ground truth**.

---

## How This Answers the Challenge

The challenge names three failures, and they map onto the first three mechanisms above. (The fourth, drill mode, answers a problem the challenge does not raise but every disaster officer does: nowhere to practise. It is beyond the ask, not part of it.) Each row also says how far it has actually been built, because "designed for" and "working today" are different claims and only one of them is worth trusting in an emergency.

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
| **Residents** of flood-prone barangays | View alerts, report water levels, follow evacuation guidance, share alerts onward. Guest mode by default — no account required, with an optional sign-in to keep the same reports and pins on a new phone. |
| **Barangay officials** — a barangay's disaster officer (BDRRMO), signed in under their own account | Issue and override alerts, track evacuation headcounts, moderate community reports, rehearse in drill mode — within their own barangay. |
| **Municipal officials** — a town's disaster office (MDRRMO), signed in under their own account | The same actions as a barangay official, across every barangay in their town, including one with no barangay official of its own. |
| **The system owner** — outside the app entirely | Appoints and removes officials by hand, in Supabase. No admin screen, no in-app role. |
| **Non-smartphone residents** | Reached through the community relay and printed emergency cards, not the app UI directly. |

**On roles and access control.** The system models residents, barangay officials and municipal officials, each official signed in under their own account and limited by the database to their own area — a barangay for one, a town for the other. This replaces the earlier plan for exactly two roles with no per-officer accounts: a shared PIN cannot be revoked for one person and cannot say who acted, and one official per barangay is a single point of failure during a night flood. The principle **"works at barangay scale with one operator" still holds**: a barangay with one official works, and so does one with none, because the municipal official covers it. Internally the role is still named `operator`, matching this document's term; screens say "official." Both official roles are precisely the BDRRMO/MDRRMO function IDEA describes.

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

This is why the computed risk score is displayed as advisory only and drives nothing, and why community pins can never auto-promote themselves into an official alert.

Override cuts both ways, so the retraction has to be as visible as the warning. When an operator lowers or withdraws an alert, residents are told in plain language — *"Alert lifted — zone management withdrew the earlier Evacuate Now"* — rather than watching it disappear. A warning system that can quietly retract a warning is one residents learn not to trust: someone who saw "Evacuate Now" and then sees an ordinary screen cannot tell an all-clear from a bug, and the safe reading of that ambiguity is the one that keeps people in a flooding house. The notice deliberately states no reason, because the operator is not asked for one and the system will not invent it.

### Anti-Abuse

Crowdsourced reporting's biggest risk is fake data. Ten layers, defence in depth:

| # | Layer | What it does |
|---|---|---|
| 1 | Geofence check | Report's GPS must fall inside the claimed zone, with generous per-zone tolerance |
| 2 | Rate limiting | One report per device per short window |
| 3 | Multi-report threshold | No single report triggers an alert; several independent, agreeing ones must arrive |
| 4 | Outlier downweighting | A report disagreeing sharply with nearby ones is discounted, not deleted |
| 5 | Anonymous identity | A server-issued, verified anonymous auth identity (Supabase Auth) — not a client-generated random ID a resident could clear at will. This is the identity every Row Level Security policy in the database actually keys off, raising the cost of abuse for real rather than by convention |
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
- **No hero imagery, video, or decorative media.** The only images in the interface are icons.
- **Motion is limited to small interface transitions** — a dialog opening, a tooltip appearing. Nothing animates the content itself, and nothing is doing continuous work while a resident is reading an alert.
- **The map is the one heavy dependency**, and it is loaded lazily rather than in the initial bundle, with a plain zone-alert list as the fallback when tiles cannot load at all.

Measured on the deployed build, a first visit to the homepage transfers roughly **250 KB compressed** across fifteen files — the document plus its JavaScript and CSS. That is the cost of arriving at the app with nothing cached; every subsequent visit is served from the device.

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
- **Filing a report, a pin, a vote, or a check-in creates a persistent, server-issued anonymous identity for that device.** This replaced a random ID the device itself generated and could clear at will — the improvement anti-abuse layer 5 describes — but the trade is real and worth stating plainly: that identity is no longer something a resident can walk away from by clearing local storage. It is created only at the first *write*, never merely by reading the app, and a reaping job for anonymous identities with nothing attributed to them is scoped for before pilot scale (see Risks & Open Questions below).
- **Community pin photos are not supported.** The pin form collects a status, a caption, and a location only. Consent and retention rules for photos would need to be designed before any photo upload ships, and until then the form does not offer one — a resident cannot attach evidence the system would then discard.
- **Officials hold real identity, unlike residents.** An official's email address (via Google sign-in or an email link) and a display name set by the system owner at appointment are held against their account, because the action record needs to say who acted. This is genuine personal data, not the anonymous identity a resident gets — the trade this design accepts so a flood alert is attributable to a person. Every official can read the full action record, across every area, because floods cross town lines and these are public officials acting in an official role; residents cannot read it at all and never see an official's name.

**Retention**

| Data | Retention | Reason |
|---|---|---|
| Location (from reports) | Short-term | Geofence validation only |
| Crowd reports | Medium-term | Calibration loop |
| Predictions / alerts | Long-term | Model improvement |
| Anonymous auth identity | Until reaped (no automatic expiry yet) | Attributes writes across a session; a scheduled cleanup of identities with nothing attributed to them is not yet built |
| Alerts issued | Indefinite | Historical record |
| Community pins | Short-term, auto-expiring | Reflects current conditions, not a permanent record |
| Pin votes | Tied to parent pin | Tally only meaningful while the pin is live |
| Resident check-ins | Short-term | Self-report of current safety status, not a permanent record; never cached by the service worker even on the reporting device — see Risks & Open Questions below |
| Officials' email address and display name | Until the system owner removes the appointment | Needed to identify who may act in an area; removal clears the role and area, but the action record keeps the name as it was at the time |
| The action record (`official_actions`) | Indefinite | Append-only accountability record; contains no resident data |
| `app_errors` | 30 days | Scrubbed crash reports with no personal data |

**RA 10173 Article 16** — data export and deletion, keyed to the resident's anonymous identity. No phone numbers stored.

---

## Architecture

**Frontend** — Next.js App Router, TypeScript strict, feature-based structure. shadcn/ui with Tailwind.

**Backend** — Supabase: Postgres with Row Level Security, Server Actions, and Auth for optional accounts. A resident gets a server-issued anonymous identity on their first write, never on a read alone — RLS reads that identity directly, not anything a client claims. `profiles` holds the role model: exactly the two roles in [Who It Serves](#who-it-serves), `resident` (the default, on first sign-in) and `operator`, and every write an operator makes is checked against it server-side. Pin vote tallies are derived at read time from `pin_votes` rather than stored on `community_pins`; a database trigger removes a pin once net-negative votes cross the layer-10 threshold in the same transaction as the vote that caused it, rather than each device computing that threshold from its own copy of the counts. Core tables: `zones`, `alerts`, `water_level_reports`, `push_subscriptions`, `audit_log`, `evacuation_centers`, `points_of_interest`, `community_pins`, `pin_votes`, `hazard_susceptibility`, `evacuation_check_ins`, `profiles`.

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

## Setup the System Owner Does

Ten one-time steps, all free, each involving a secret, an account setting or a push to `main` — so the system owner does them by hand, never through the app and never an agent. Steps 1–3 and 5 are needed before any official can sign in at all; steps 4 and 6 only matter for the email-link backup, since Google sign-in works without them; step 7 (below) switches on monitoring alerts; steps 8 and 9 turn on email alerts and make the test accounts; step 10 lets Supabase start the scheduled jobs on time.

1. **Google sign-in** (Google Cloud Console, then Supabase). Create an OAuth client under APIs & Services → Credentials, and paste its Client ID and Client Secret into Supabase → Authentication → Providers → Google. On the Google OAuth client, add Supabase's callback — `https://<project-ref>.supabase.co/auth/v1/callback`, shown as "Callback URL" on that same Supabase Google panel — under **Authorized redirect URIs**; without it Google refuses with "Error 400: redirect_uri_mismatch". Google always returns to Supabase first, so the app's own addresses do not go here. Move the OAuth consent screen out of "Testing" — while it stays there, only accounts added as test users can sign in.
2. **Manual linking** (Supabase). Switch on "Allow manual linking" under Authentication → Sign In / Providers. Without it, linking a new Google or email identity to an existing anonymous resident session fails — Google sign-in from that session reports "Manual linking is disabled" — so an official who was already using the app as a resident cannot carry their reports and pins across to their official account.
3. **Redirect URLs** (Supabase). Add the app's origins to Authentication → URL Configuration → Redirect URLs, one per origin as `<origin>/**` — for example `http://localhost:3000/**` for `npm run dev` and `http://localhost:3100/**` for the local production build and `https://<project>-git-<branch>-<team>.vercel.app/**` for a deployed preview. An origin entered this way covers both `/auth/callback` (where Google's OAuth redirect lands) and `/auth/confirm` (where an email sign-in link lands), since both are paths under the same origin.
4. **Email sending** (Supabase). Connect a free SMTP provider under Authentication → SMTP Settings before launch. Supabase's built-in sender only reaches addresses pre-authorised inside the Supabase organisation, so without this the email-link backup cannot reach a real official.
5. **Vercel Preview settings** (Vercel). In the project's Environment Variables, tick `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the **Preview** environment as well as Production — left unticked, a preview deployment cannot reach Supabase at all.
6. **Email templates** (Supabase). `/auth/confirm` reads a one-time `token_hash` and `type` from the query string rather than exchanging a code, because a code-exchange link opened in a different browser than the one that requested it cannot complete. In Authentication → Email Templates, set the **Magic Link** template's link to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`, and the **Change Email Address** template's link to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email_change`. `{{ .RedirectTo }}` already carries `/auth/confirm?next=…`, which is why each addition starts with `&`.

**Email confirmation is off, by the owner's decision (25 September 2026).** Authentication → Sign In / Providers → Email → "Confirm email" is switched off, so a password account works the moment it is made. The cost: an address no longer proves it belongs to whoever typed it, so `appoint_official`'s confirmed-email check proves nothing. Before appointing anyone, confirm by phone or in person that the email is theirs, and prefer their Google account, whose address Google has checked. For the same reason email alerts go only to Google accounts, and a forgotten password is reset by security questions (residents) or by an admin (officials), never by an email link.

**Monitoring alerts need one more step.** Crashes are already saved to `app_errors`, and `/api/health` already answers, with no secret and no account setting. The `Monitor` GitHub Actions workflow that emails on failure is committed on `v0` but **does not run yet**: GitHub runs scheduled workflows only from the default branch, and `main` has not been pushed. To switch alerts on:

7. **Push monitoring to `main`** (GitHub). *Done 17 September 2026.* Push `.github/workflows/monitor.yml`, `scripts/check-health.mjs` and a `vercel.json` that disables deployments from `main` (`"git": { "deploymentEnabled": { "main": false } }`) to `main`, so the schedule starts without `main` deploying over the app. When V0 is promoted to production, change `HEALTH_URL` in `monitor.yml` from the V0 preview address to the production address (done: it now points at production). Keep GitHub's notification email for failed workflow runs on (GitHub → Settings → Notifications → Actions, on by default); that email is the alert.

8. **Gmail for email alerts** (Google, then Vercel). Make a Gmail account for WeatherWell, turn on 2-Step Verification, and create an app password (Google Account → Security → App passwords). Set `GMAIL_USER` (the address) and `GMAIL_APP_PASSWORD` in Vercel for Production and Preview. Gmail sends about 500 emails a day from a free account. Links in the emails point at `https://weatherwell.vercel.app` unless `APP_URL` says otherwise.
9. **Test accounts** (your machine). Put `TEST_ADMIN_PASSWORD`, `TEST_BARANGAY_PASSWORD`, `TEST_USER_PASSWORD` and `TEST_MUNICIPAL_PASSWORD` in `.env.local` (never in a committed file), then run `npx tsx scripts/reset-test-accounts.ts` to see the plan and add `--yes` to do it. It deletes the old test accounts and makes `adminTEST@`, `Brgy.NilombotTEST@`, `userTEST@` and `Mun.MapandanTEST@weatherwell.com`.
10. **Scheduled jobs on time** (GitHub, then Supabase). GitHub starts the scheduled workflows hours late on its free runners, so Supabase's `pg_cron` asks GitHub to run them every 15 minutes (monitor) and every 3 hours (threshold engine and typhoon refresh). It needs a token. In GitHub, go to Settings → Developer settings → Personal access tokens → Fine-grained tokens and generate one with access to only the `WeatherWell` repository and one permission, **Actions: Read and write**. In Supabase, open Vault and add a secret named `github_workflow_token` holding the token; or run `select vault.create_secret('<token>', 'github_workflow_token');` in the SQL Editor, then delete that query from the editor, since it holds the token in plain text. Within 15 minutes the Actions tab shows a `workflow_dispatch` run of Monitor. When the token expires, the jobs fall back to GitHub's own late schedule until a new token replaces the secret. Until this step is done, each attempt logs a warning in Postgres and does nothing else.

Until step 7 is done, nothing emails anyone. The only ways to see a problem are reading `app_errors` in Supabase (Table Editor) or opening `/api/health` by hand.

**Before appointing anyone for a new barangay:** confirm its PSGC code against the PSA's official published list at psa.gov.ph (a code ending in `000` is the town's, not a barangay's). The four demo barangays were checked on 15 September 2026 — see the "Officials and areas" row in [Build Status](#build-status). This code is the exact permission boundary that decides who may issue an alert for a barangay; appointing an official against a wrong code silently hands them the wrong area, and nothing else in the system would catch it.

---

## Build Status

**As of 26 September 2026 · Stages 1–3 shipped, Stage 4 (`mvp`) built.** `v1` is the production branch. Stage 3 left four things undone: real hazard data, self-hosted routing, the prediction engine and the cascade heads-up. Two of Stage 4's exit criteria wait on events outside the code: a real flood for the calibration loop to measure, and the pilot drill.

This table is the single source of truth for implementation state. Everything above describes the design; this describes what exists today.

**Residents**

| Capability | Status | Note |
|---|---|---|
| All screens | **Built** | 21 pages for residents, officials and the admin, listed in `README.md`. Each has its own title |
| Bilingual UI (English / Filipino) | **Built** | Every user-facing string, including screen-reader labels, goes through the localisation layer. The page's `lang` follows the language toggle |
| Onboarding, consent, barangay selection | **Built** | Any of the 41,803 barangays can be chosen. "Use my location" proposes the nearest one and never confirms for the resident. The consent notice is versioned (`2026-09-25`), so a change asks again. It is grouped into "You choose" and "Always on", and names the anonymous account and the routing server that receives a position. Nothing reads the position before consent |
| Coverage labels | **Built** | A barangay counts as covered only with a verified hotline and evacuation centre; the rest say *Alerts only*. None is covered yet, because hotlines and centres have to come from the barangays themselves |
| Install prompt at the end of onboarding | **Built** | Uses the browser's real install dialog where one exists; explains the Share-sheet route on iOS, which has none. Skippable, and not shown to an already-installed device |
| Homepage map, live position, markers, legend | **Built** | Leaflet with the hazard backdrop and POI markers. The barangay list is served compacted from `/data/reference-data.json` |
| Weather and river data | **Built** | Rain now, over the last 12 hours and for the next 6 from Open-Meteo; a 7-day river outlook from Open-Meteo's GloFAS flood API; the typhoon bulletin scraped from PAGASA, with GDACS as a labelled backup that never claims a wind signal. All free and key-less |
| Hazard susceptibility data | **Not started** | No DENR-MGB data is loaded, so every barangay's hazard reads "Unknown". The next row is what makes that safe |
| Missing hazard data | **Built** | A barangay with no hazard rating shows "Unknown" / "Hindi tiyak" on every screen instead of crashing, and never raises a landslide caution |
| Water-level reporting | **Built** | One tap per depth, with 3 seconds to undo. The confirmation says how many more neighbours must report before the barangay gets an advisory, and stays until the next tap |
| Community pins | **Built** | Shared through Postgres and Row Level Security. A pin needs a short description. No photos: the form does not collect one, pending consent and retention rules |
| Pin votes | **Built** | One vote per resident (a unique constraint on `(pin_id, voter_id)`); net-score removal runs as a database trigger on the same write |
| Evacuation guidance | **Built** | Instructions, likely sites from OpenStreetMap (shown as unconfirmed until an official confirms one), "How high am I?", the emergency card, neighbours to text and check-in. Headcount and centre status are set by the official and seen on every phone |
| Directions to the centre | **Built** | A route from the public OSRM server (`OSRM_BASE_URL` can point at another), plus a live bearing and distance worked out on the phone. Positions go in a POST body, never in a URL. It uses OSRM's car profile and does not steer around flooded barangays |
| Read-aloud | **Built** | On alert details and evacuation instructions. Uses a Filipino voice when the phone has one; otherwise reads the English text and says so |
| Resident check-in | **Built** | Self-report, shared through Postgres: a resident sees only their own row, an official their barangay's. Never cached by the service worker, a privacy decision. No verification and no delivery to responders |
| Passing an alert on | **Built** | A forwarded link (`/a?d=…`) renders as plain HTML, readable with JavaScript off. One tap texts the alert to up to 5 saved neighbours from the resident's own phone |
| Printable flood plan and emergency card | **Built** | `/plan/[zoneId]` for each barangay; the card is on the evacuation page |
| PWA manifest + service worker cache | **Built** | Cache names carry a version, so a fix reaches phones that already installed the app |
| Offline map tiles | **Built** | After onboarding, about 28 tiles (zoom 12–15, within 2 km of the chosen barangay) are cached in the background |
| Offline fallback when the map cannot draw | **Built** | Degrades to a plain list of barangay alerts |
| Offline sending (outbox + Background Sync) | **Built** | Queued writes are kept in the page's local queue and mirrored to IndexedDB. Where Background Sync exists (Chromium on Android, Edge, Samsung Internet) the service worker sends them with the app closed; iOS Safari and Firefox send when the app is reopened. Every write goes through `POST /api/outbox/<operation>`, which checks the entry belongs to whoever is signed in. Reports and check-ins keep the time they were made, measured on the device and applied to the server's clock: a report more than 6 hours old is refused as too old, a check-in more than 3 days old is refused, and an older check-in never overwrites a newer one. A report from too far outside its barangay stops at once and says why; one held back by the rate limit waits and says so. Retries back off (0, 1, 5, 15, 60 minutes) and stop after 10 attempts or 3 days. A header badge shows the signed-in person's waiting and couldn't-send items, with Retry and Discard. **Known limit:** a resident's very first write on a shared phone is queued before any account exists, so whoever next signs in on that device claims it. **Verified live on 17 September 2026** (backdated, too-old, service-worker and other-person cases); closed-app sending on a real Android phone has not been observed yet |

**Alerts**

| Capability | Status | Note |
|---|---|---|
| Automatic alert engine | **Built** | Runs after every report and every 3 hours. Raises an unverified yellow advisory when enough located reporters in one barangay report flooding within 6 hours, one of them with an identity over a day old, and withdraws its own advisory once the evidence ages out. Each barangay has its own bar: 3 reporters with combined trust 1.0 at the floor, at most 5 and 2.0 (see the calibration loop). On the live database it has so far run only on labelled test data |
| Push notifications | **Built** | Web Push with VAPID keys, sent only to the browsers' own push services. A phone subscribes for one barangay, and the subscription follows whichever account is using the phone. Sent when an advisory is raised and when an official sets, changes, lifts or rejects the barangay's alert. The service worker retries a failed display once after 60 seconds |
| Email alerts | **Built** | Opt-in, for accounts signed in with Google, sent from a Gmail app password (Setup step 8), with a one-click unsubscribe. A free Gmail account sends about 500 a day |
| SMS provider | **Not started** | No paid provider. Residents text an alert on from their own phones (see "Passing an alert on") |
| Confidence tags | **Built** | Shown wherever an alert is. An automatic advisory is *Estimated* until its barangay has had 3 advisories confirmed, then *Validated*, and *Calibrated* once 10 have been settled and the loop has moved its bar. An official's own alert says it was set by an official |
| Calibration loop | **Built; no real flood yet** | Records each automatic advisory's outcome: confirmed or rejected by an official, expired without a verdict, or missed (an official raised the alert while flood reports were arriving and the engine had stayed quiet). At least two rejections, outnumbering confirmations since the bar last moved and within 90 days, raise that barangay's bar one step; a missed event lowers it one step, never below the floor. Every move goes in the action record as "Automatic — calibration", and officials see the outcomes and raised bars on the dashboard. The exit criterion needs a real flood; none has happened since it shipped |
| Prediction engine | **Not started** | Nothing forecasts when flooding reaches a barangay or how deep. `alerts.predicted_timing` exists and nothing writes it, so the loop compares outcomes, not timings |
| Cascade heads-up | **Not started** | Upstream-to-downstream links are drawn on the operations map from the real `downstreamZoneId`, but an upstream alert raises nothing downstream |
| Advisory risk score | **Removed (23 September)** | It, the rainfall and report-trend panels and the alert analytics were built on invented numbers. An ESLint rule now keeps mock data to tests and the drill |

**Officials**

| Capability | Status | Note |
|---|---|---|
| Dashboard, barangay page, operations map | **Built** | "Needs your attention" lists automatic advisories to confirm or reject, and an official's own alerts once a day old. The operations map adds cascade lines and past flood events |
| Official alerts (severity, centre status, occupancy) | **Built** | Shared through Postgres: an official's decision reaches every resident's phone |
| Human override (layer 7) | **Built** | Confirming re-issues an advisory as the official's own; rejecting records a rejection that counts against the devices that raised it; an official can lower or lift any alert in their area |
| Transparent downgrade (layer 9) | **Built** | A lowered or withdrawn alert states itself on the homepage and the evacuation page, naming what was withdrawn. It states no reason, because the official is not asked for one |
| Drill mode | **Built** | 6 scenarios at `/admin/simulation`; notifies nobody |
| Officials and areas | **Built** | Two tiers, as in RA 10121. A barangay official runs one barangay. A municipal official oversees every barangay in the town, appoints and removes its barangay officials, and exchanges short updates with them. `private.manages_zone` limits every write to the official's own area, in the database. **Barangay codes verified:** the four demo barangays' PSGC codes were checked by hand against the PSA's official list on 15 September 2026 — Nilombot `0105528012`, Poblacion (Mangaldan) `0105526025`, Poblacion (Manaoag) `0105525039`, and Poblacion Norte (Santa Barbara) `0105538021`. Any barangay added later needs the same check. **Known limit:** a community pin whose barangay cannot be resolved is hidden from every admin surface |
| Appointing officials | **Built** | In the app at `/admin/officials`: the admin appoints anyone, a municipal official the barangay officials of their own town |
| Accounts and sign-in | **Built** | Google, or email and password with no confirmation email (see the note after Setup step 6). Signing in from an anonymous session keeps that resident's reports and pins. A resident who forgets a password answers two security questions, 5 tries an hour; an official gets a new one from an admin. Google linking was **verified live on 15 September 2026**. The email-link sign-in was removed on 22 September |
| The action record | **Built** | Append-only `official_actions`, written by database triggers and readable by every official at `/admin/history`. Automatic entries name their cause: a net-score pin removal, the engine's advisories, the calibration loop's bar moves. `anon` and `authenticated` hold no write grant; the `service_role` key keeps full access, as it does on every table |

**Anti-abuse (the ten layers)**

| Capability | Status | Note |
|---|---|---|
| Geofence (layer 1) | **Built** | A report must come from within 15 km of its barangay's centre point, or it is refused as too far |
| Rate limit (layer 2) | **Built** | One report per identity per barangay every 5 minutes, timed by the database's own receipt, not the phone |
| Multi-report threshold (layer 3) | **Built** | The engine's per-barangay bar |
| Outlier downweighting (layer 4) | **Built** | A report three depth levels off what established neighbours report is an outlier and does not count. The consensus takes each established reporter's latest report, so one device repeating itself cannot set it |
| Anonymous identity (layer 5) | **Built** | Server-issued by Supabase Auth, not an ID a resident could clear. An identity under a day old earns no bonuses and cannot set the outlier consensus, and every advisory needs one reporter over a day old |
| Reputation scoring (layer 6) | **Built** | Any device counts 0.2. An identity over a day old gains for a prior check-in in the barangay, a longer history and corroborated reports; a device whose advisories officials confirmed gains 0.3 (at most 1.0 in all); one whose advisories were rejected more often than confirmed counts 0 |
| Audit trail (layer 8) | **Built** | Reports keep their time, location and identity; official and automatic actions are in the action record |
| Pin vote protection (layer 10) | **Partly built** | One vote per resident and net-score removal run in the database. Pins and votes do not yet get the geofence or rate limit |
| Abuse-attempt suite | **Built** | `supabase/tests/abuse.sql` runs one documented attack per layer (A1–A5, H1–H3, R1–R6), each shown to fail against the old code, and runs in CI. Its header lists the attacks the database cannot stop |

**Platform**

| Capability | Status | Note |
|---|---|---|
| Backend (Postgres, Row Level Security, anonymous Auth) | **Built** | A resident gets a server-issued anonymous identity on their first *write*; a read alone never signs anyone in. The alert engine, trust scoring, geofence, rate limit and area checks all run in the database |
| Error / uptime monitoring | **Built and active** | Crashes are saved to `app_errors`, scrubbed of personal data and barangay ids. `/api/health` counts only its own deployment's recent errors. The `Monitor` workflow emails the owner on failure or new crashes, and now checks production |
| Scheduled jobs | **Built; on time once Setup step 10 is done** | The engine and typhoon refresh run every 3 hours and the health check every 15 minutes, as GitHub Actions. GitHub's free runners start them late: on 25 September the 15-minute check ran every 3 to 5 hours. Supabase's `pg_cron` now starts both on time through `workflow_dispatch`, once a GitHub token is in Vault; until then it logs a warning and GitHub's own schedule carries on |
| Accessibility (WCAG 2.1 AA) | **Audited, 26 September 2026** | Every page checked for keyboard use, focus, reflow at 320 px, contrast, names and `lang`. Fixed: placing a pin or marker without a pointer, form-field edges and the focus ring below 3:1, card titles that were not headings, `lang` not following the toggle, the one-tap report's message disappearing after 3 seconds, and every page titled only "WeatherWell". The axe sweep runs in CI, and tests check the palette's contrast and the page titles, which jsdom cannot see. The app is dark-only, so a light-theme preference still renders dark |
| Location privacy | **Built** | Positions go in POST bodies, never in a URL. Elevation lookups round the position to about 100 m and store nothing |
| Data export and deletion (RA 10173 Article 16) | **Not started** | A resident cannot yet download or delete their data from the app |
| Clean-up of unused anonymous identities | **Not started** | Nothing removes anonymous identities with nothing attributed to them (see Risks & Open Questions) |

---

## Roadmap

IDEA describes this challenge as "hi-fi prototype first, then functional build, full implementation, and final testing." Those are the four stages below.

### Stage 1 — `hi-fi` · Prototype
Every screen, on realistic mock data, no backend.

**Done when:** a complete first-run click-through works from a cleared device, the operator demo is presentable, the automated accessibility sweep passes, and a review of the whole branch has been run with every finding resolved.

**Status: complete.** The click-through was walked end to end from cleared storage across all nine routes. Continuous integration runs lint, type-checking, the test suite, an unused-code check and a production build on every push. The branch review raised seven correctness findings — five of them the same defect, where an operator's decision was not fully honoured downstream of the control that made it — and each is fixed with either a regression test proven to fail against the old behaviour, or a function signature that makes the mistake a compile error rather than a silently wrong answer.

That last criterion is deliberately part of the bar rather than a note. Every item on the build list existed before the review, and the build still contained a path that showed residents "Evacuate immediately" under an "Advisory" badge. "Everything is built" and "everything works" are different claims, and only the second is worth making about a warning system.

### Stage 2 — `v0` · Functional build
Real data and real offline capability. Supabase schema with Row Level Security, Server Actions, Auth, officials with their own accounts limited by the database to their area, and an append-only record of official actions. Service worker with Background Sync. A decision on whether pin photos go live.

**Done when:** the app works fully offline on real seeded data, optional resident sign-in works, officials sign in with their own accounts, each limited to their area, and every official action is recorded, and error/uptime monitoring is active.

> Officials, areas and the action record ship **in this stage, alongside the database — not after it.** `/admin` was unauthenticated once the shared backend went live, and that was no longer harmless: before the backend existed, a stranger who opened `/admin` could only mislead themselves, since every override wrote to their own device alone. With a shared backend, the same unauthenticated screen could change what a whole barangay is told during a flood. Officials must be able to sign in, each limited to their own area, before any real deployment — which is why it is an exit criterion rather than a task on a list.

> Start the PAGASA data request at the *beginning* of this stage. It gates the highest-quality data option and moves on an institutional timeline, not ours, even though the data it returns is not wired in until Stage 3.

### Stage 3 — `v1` · Full implementation
The core mechanism goes live: threshold engine, Web Push with retry, anti-abuse layers 1–3 and the audit trail, and the analytics dashboard rewired from mock data onto that real audit trail. Alongside it, one **geography and real data** theme: the country-wide barangay list, real GPS detection, offline map tiles, real PAGASA and hazard data replacing the mocks, and self-hosted OSRM for real safest-route calculation. These move together to this stage rather than shipping for Stage 2's four demo barangays first — building any of them for four barangays now would be redone nationally once the real, country-wide list lands, so they wait for it.

**Done when:** a genuine crowd-report scenario auto-triggers an alert and delivers it via push with retry — end to end, no mocks in the path.

### Stage 4 — `mvp` · Final testing
Reputation scoring, outlier downweighting, device-fingerprint hardening, TTS, the calibration loop, and a field pilot.

**Done when**, measurably:
- Anti-abuse layers 1–6 are all live and a documented abuse-attempt test suite passes against them.
- The calibration loop has run against at least one real event, with prediction-versus-actual recorded.
- A full WCAG 2.1 AA audit passes with no outstanding violations.
- The pilot barangay has completed at least one drill using the system, and the resulting feedback is either incorporated or explicitly logged as deferred.

**Status (26 September 2026): two of four met.** Anti-abuse layers 1–6 are live and `supabase/tests/abuse.sql` passes in CI. The WCAG 2.1 AA audit passed after its fixes. The calibration loop is built and recording, and needs a real flood to run against. The pilot drill is the owner's to run, with drill mode at `/admin/simulation`.

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

- **The sensor network has a participation floor, and it is not yet known.** Crowdsourced sensing only fires when several independent, agreeing reports arrive in one zone inside the time window. In a single barangay, at the 30% enrolment target, with residents evacuating rather than reporting, that number may not be reached — and the mechanism answering the challenge's third clause is the one most exposed to it. The threshold is tunable per zone precisely because the right value is an empirical question, but the pilot needs to measure reports-per-zone-per-event before any claim about coverage is safe to make. Below the floor the system degrades to operator-issued and prediction-driven alerts, which is a working system, but not the one this clause promises.
- **Cached content is only as fresh as the resident's last visit.** Someone who opens the app on Monday and loses signal on Thursday is reading Monday's picture. It is labelled with its own age, but there is nothing that nudges a refresh while a storm is still forecast and the network still works — the cheapest available mitigation and not yet designed. The freshness policy (how stale is too stale to show without a warning) is an open question, not a settled one.
- **Web Push delivery is not guaranteed** — it varies by device and browser. Retry, cache fallback, and Share Alert exist specifically because this channel cannot be trusted alone. Share Alert also needs the *sender* to have a working channel: Messenger and Viber need data, so in a total data outage SMS is the relay's last working leg.
- **RA 10173 compliance is stated by design but not legally reviewed.** A legal review is recommended before any real deployment. One design decision that review should specifically examine: resident check-ins are the one server response this app never lets a device cache, anywhere — not the general offline-resilience cache, not the browser's own Cache Storage. A check-in names a person and says whether they need help, and Row Level Security already decides which *rows* a caller may read; a shared cache has no equivalent opinion about who it hands a finished response to. That is a privacy position, not a technical limitation — nothing about check-in data makes it harder to cache than a pin or a report, and it is deliberately excluded on that basis alone.
- **Anonymous identities accumulate with no automatic reaping.** A resident's first write creates one, permanently, against a free-tier allowance — and unlike the random local ID it replaced, a resident cannot clear it from their own device. A scheduled cleanup of anonymous identities with no rows attached to them is needed before pilot scale, not merely before a hard limit is hit.
- **Non-smartphone residents have no direct app access.** They depend entirely on the community relay and printed cards — an operational system requiring barangay coordination, and therefore the part of the design most likely to fail for reasons outside the software.
- **Success-metric targets are unvalidated hypotheses.** No comparable Philippine deployment provides a baseline.
- **No programmatic heat-index source has been found.** The reading should be dropped rather than faked if one cannot be secured.
- **PAGASA's formal data-request process has an unknown timeline** and gates the best data option, which is why it opens at the start of Stage 2 rather than the end.
- **`pagasa-parser-web` is volunteer infrastructure** with no uptime commitment, and its load peaks at exactly the moment ours does.
