# WeatherWell User Manual

WeatherWell is a flood-alert app for Philippine barangays. It tells you
**"should I evacuate now?"** for your own barangay — and it keeps telling you
when the network goes down.

Live app: **https://weatherwell.vercel.app**
English and Filipino, on phone or desktop.

---

## 1. Getting started (residents)

1. **Open the app** — https://weatherwell.vercel.app. The first visit runs
   onboarding.
2. **Read the consent notice.** It explains what is collected and why, in
   plain language. You can decline location and still see public alerts.
3. **Pick your barangay.** All 41,803 Philippine barangays are selectable, or
   tap *Use my location* to be proposed the nearest one. You can change it
   later from the home screen.
4. **Turn on alerts** — push notifications (and email, if you sign in with
   Google) when an alert is raised, changed, lifted, or rejected for your
   barangay.
5. **Install the app** (end of onboarding). This matters: the app must be on
   your phone *before* the storm, because that is exactly when it can no
   longer be downloaded. Android browsers show an install dialog; iPhones use
   Share → *Add to Home Screen*.

You never need an account to read alerts. An account is only needed to keep
your reports and pins when you switch phones.

---

## 2. Reading your status (home screen `/`)

Top to bottom:

| Section | What it tells you |
|---|---|
| **Status headline** | Your barangay's plain-language status: **Safe**, **Cautionary**, **Dangerous**, or **Hazardous** (evacuate now) |
| **Alert details** | The active alert, its age, who set it (official / automatic / forecast), and its confidence tag |
| **Current conditions** | Rain now, last 12 hours, next 6 hours; a 7-day river outlook |
| **Map** | Barangay markers, your position, community pins, evacuation centres |
| **Report button** | One tap to report water level |

**Alert vocabulary** matches PAGASA's own colours, so it reads the same as
radio and TV:

| Alert | Meaning |
|---|---|
| Yellow — Advisory | Early-stage risk |
| Orange — Watch | Conditions worsening |
| Red — Warning | Active flooding |
| **Evacuate Now** | Leave now |

**Confidence tags** say how much an automatic advisory is worth:

- **Estimated** — new, not yet confirmed by officials.
- **Validated** — several of this barangay's advisories were confirmed.
- **Calibrated** — many outcomes settled, and the threshold has self-tuned.

An alert set by an official always says so. If a lowered or withdrawn alert
replaced one you saw, the app says that in plain words — it never quietly
removes a warning.

**Reading aloud:** every alert and evacuation instruction has a read-aloud
button (Filipino voice when the phone has one).

---

## 3. Reporting a water level (`/report`)

Residents are the sensor network — no hardware needed.

1. Tap **Report**, pick the depth: **dry / ankle / knee / waist / neck**.
2. 3 seconds to undo. That's it.

Rules that keep reports honest:

- One report per barangay every 5 minutes.
- Your report counts for the barangay your GPS puts you in (within 2 km of
  your own barangay it stays yours) — never one you are only viewing.
- The confirmation tells you how many more neighbours are needed before the
  barangay gets an advisory.
- Reports sent without a position do not count toward the advisory.
- If you are offline, the report queues and sends automatically when the
  network returns (a badge shows what is waiting).

---

## 4. Evacuation guidance (`/evacuation`)

- **Instructions** written by your barangay's official (specific centre and
  route), with a call button for each hotline.
- **Find safe evacuation center** — the nearest usable place within 10 km:
  confirmed centres first, else likely sites from OpenStreetMap (marked
  *Not confirmed by your barangay*). It walks a real route that avoids
  barangays under Warning/Evacuate and recent blocking pins; if every route
  is affected, it shows the least affected one and says exactly what is on
  it. Offline it draws a marked straight line from saved data.
- **How high am I?** — a depth reference with adult and child silhouettes,
  so you can judge "waist-deep" without a number.
- **Emergency card** — zone, centre, route, hotline, QR code. Printable
  (`/plan/[zoneId]`), for people without smartphones.
- **Neighbours to text** — save up to 5 contacts once; afterwards it is one
  tap to send them the alert.
- **Check-in** — mark yourself safe / needs help. Only your barangay's
  officials see it.

**Depth maps one tier hotter than it looks:** waist-deep already means
evacuate, because waist-deep on an adult is near a child's shoulders.

---

## 5. When the network goes down

WeatherWell is built for exactly this:

- **Cached alerts and instructions** — the app you already opened keeps your
  status, evacuation instructions and route on the phone. Cached content is
  labelled with its age.
- **Offline map** — about 28 tiles around your barangay are cached after
  onboarding; if tiles can't load, the map degrades to a plain alert list.
- **Offline sending** — reports, pins, votes and check-ins queue in an
  outbox and send when the network returns (with the app closed on Android).
- **Share Alert** — forward the alert through your own Messenger, WhatsApp,
  Viber or SMS. The person is the network.
- **Forwarded alert links** (`/a?d=…`) render as plain HTML — readable with
  no app and no JavaScript.

---

## 6. Community pins and the map (`/map`)

- **Add a pin:** what is happening — Flood (flooded / rising / receding /
  impassable), Road blocked, Landslide, Power line down, or Other — plus a
  short description. One photo per new pin is optional; **only officials see
  it**, and it is deleted after 7 days.
- **Vote** on pins you agree with. A pin that net goes negative is removed
  (soft-deleted, so it can be restored).
- Limits: 5 pins and 30 votes per account per hour, 10 photos a day; pins
  must be within 15 km of their barangay.

---

## 7. Officials' guide (`/admin`)

Signed-in barangay officials (one barangay) and municipal officials (whole
town). Everything is enforced by the database — an official can only write
inside their own area.

| Task | Where |
|---|---|
| Confirm or reject an automatic advisory | **Needs your attention** on the dashboard |
| Set / change / lift an alert (severity, centre status, occupancy) | Three-step alert on the dashboard |
| Edit hotlines, evacuation instructions, place the evacuation centre | `/admin/zone/[zoneId]` |
| Set flood / landslide / storm-surge levels and the downstream barangay | Barangay details form |
| Operations map (cascade lines, past events, pin photos) | `/admin/map` |
| Review every recorded action | `/admin/history` |
| Appoint/remove officials | `/admin/officials` (admin / municipal) |
| **Drill mode** — rehearse end-to-end, notifies nobody | `/admin/simulation` |

Key behaviours:

- **Confirming** re-issues an advisory as the official's own alert.
  **Rejecting** records a rejection that counts against the devices that
  raised it, and feeds the calibration loop.
- **Their own alerts never expire**, but are listed for review once a day old.
  Forecast advisories end themselves and never need re-confirmation.
- **Cascade heads-up:** when your barangay first reaches Warning/Evacuate,
  the barangay your floodwater reaches next gets a heads-up for its officials
  — by push and email. They mark it seen.
- **Alerts they send residents get a push** whenever they set, change, lift
  or reject their barangay's alert.

**Drill mode replays six scenarios** (prediction, alert issued, push sent,
push failing, SMS fallback, cache, downstream cascade) on the real dashboard
against real zones — and notifies nobody. The first time an officer issues
an evacuation order should not be during an evacuation.

---

## 8. Your data (Settings → Your data)

Under the Data Privacy Act (RA 10173):

- **Download** everything held about you as `weatherwell-my-data.json`.
- **Delete my data** (type DELETE): reports are anonymised (they stay in the
  barangay's counts without account or location), pins are detached, photos
  and votes and check-ins are deleted, and the account is removed.
- **Forget this phone** empties your queued reports and onboarding.
- Location is used for geofence checks and zone detection, never stored.
  Pin photos: officials only, 7 days, metadata stripped.
- Unsubscribe from emails with the link at the bottom of any email
  (`/unsubscribe`).

---

## 9. Accessibility and language

- **English / Filipino** — toggle anywhere; every string, including screen
  labels, is translated.
- **WCAG 2.1 AA** audited: keyboard navigation, contrast, 320 px reflow,
  no colour-only signalling (markers pair shape with colour), page titles.
- **Read-aloud** for alerts and instructions.
- **Low-literacy design:** depth is a picture, instructions have pictogram
  cues, targets are large, dark mode by default (OLED battery saving).
- Runs on low-end Android phones; first visit is ~250 KB compressed.

---

## 10. Troubleshooting

| Problem | What to do |
|---|---|
| No alerts arriving | Check notifications are on for the browser/site; re-subscribe in Settings. Push needs the app installed and an open of the app after subscribing |
| App looks stale after a fix | Pull to refresh / reopen — cache versions bump on every deploy, so new builds reach installed apps |
| Report won't send | It is queued — check the outbox badge (waiting / couldn't send) with Retry and Discard. Too-old reports (>6 h) and out-of-area reports are refused with a reason |
| Map is blank | Tiles need a connection on first view; the alert list below the map is the fallback |
| Forgot password (resident) | `/forgot-password` — answer your two security questions (5 tries/hour) |
| Forgot password (official) | An admin resets it (barangay officials: the municipal official; admins are made only by hand in Supabase) |
| Wrong barangay | Home screen → **Change**; `?zone=` lets you view another barangay without changing yours |
| No smartphone in the household | Use the printed emergency card and your barangay's alert captains — the community relay |

---

## 11. Quick route reference

| Route | Who | What |
|---|---|---|
| `/` | Resident | Status, alerts, weather, report, map |
| `/onboarding` | Resident | Consent + barangay selection |
| `/report` | Resident | Water-level report |
| `/evacuation` | Resident | Instructions, routes, emergency card, check-in |
| `/map` | Resident | Multi-barangay overview |
| `/a` | Anyone | A forwarded alert (works without JS) |
| `/plan/[zoneId]` | Anyone | Printable flood plan |
| `/forgot-password` | Resident | Security-question reset |
| `/unsubscribe` | Anyone | Stop email alerts |
| `/admin` | Official | Dashboard, alerts, monitoring |
| `/admin/zone/[zoneId]` | Official | One barangay's details and reports |
| `/admin/map` | Official | Operations map |
| `/admin/history` | Official | Every recorded action |
| `/admin/officials` | Admin | Appoint / remove officials |
| `/admin/simulation` | Official | Drill mode (notifies nobody) |

---

*WeatherWell — offline-first flood alerts for Philippine barangays.
Complements PAGASA; it does not replace official warnings.*
