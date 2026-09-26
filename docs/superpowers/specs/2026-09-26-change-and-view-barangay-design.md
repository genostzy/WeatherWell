# Change your barangay, view others, and report where you are — Design

**Date:** 26 September 2026 · **Status:** design, for the owner's review

## Why

A resident picks a barangay once, during setup, and nothing afterwards can change it. The app still tells a resident whose report was refused "if you've moved, change your barangay", which there is no way to do. The Zones list has an Evacuation and a Report button on every barangay, but both always open the resident's own barangay, not the one tapped. And GPS, which matters most in an emergency, is used only for the direction to the evacuation centre and one danger banner (English only).

## Decisions (owner, 26 September)

- **Model: my barangay, plus viewing others.** One saved barangay carries the resident's alerts. Any other barangay can be viewed for a while, with an easy way back. GPS says where you are, but never switches the screen by itself.
- **Reports count where GPS says you are.** With GPS off (or not allowed, or too far from any barangay), they count for your own barangay. Never for a barangay you are only viewing.

## Three barangays, named once

| Name | What it is | Where it comes from |
|---|---|---|
| **My barangay** | The resident's own. Push and email alerts, the hotline button and the default screens follow it. | Saved on the phone (`weatherwell.selectedZoneId`), as today. Changed only by the resident. |
| **Viewed barangay** | One the resident is looking at for now. Changes nothing else. | The address: `?zone=<zoneId>` on `/` and `/evacuation`. |
| **Where you are** | The barangay GPS puts the resident in. | The live position, matched to the nearest barangay centre within 15 km, on the phone. Only with consent. |

## What residents see

**My barangay.** The home screen names it with a **Change** button. Change opens the setup picker (search, or "Use my location") in a dialog. Picking one makes it the resident's barangay and moves their alerts: push follows at once, and email alerts follow if they are on. The screen confirms "Alerts now come for Barangay X". The button is on the home screen, not in Settings, because Settings needs an account and most residents have none. The Zones list's "Your zone" card has the same button.

**Viewing another barangay.** From the Zones list, **View** on any barangay opens the home screen for it: its alert, conditions, river outlook, coverage, reports and evacuation links. A bar at the top says "Viewing Barangay X — your alerts still come for Barangay M" with **Back to my barangay**. The Zones list's buttons become **View** and **Evacuation**, both for the barangay on that card; the per-card Report button goes, because reports count where you are.

**Where you are.** When GPS puts the resident in a barangay other than their own (and not the one on screen), the home screen says "You're in Barangay Y now · View". While viewing any barangay, **My location** opens the barangay GPS puts them in (the plain home screen, when that is their own). The danger banner stays: it appears when the resident is within 2 km of the centre of a barangay under a Warning or Evacuate alert, and it moves to both languages.

**Reports.** The one-tap report and `/report` say before the tap which barangay the report counts for: "Reporting for Barangay Y (where you are)" or "Reporting for Barangay M (your barangay)". The rule: where you are, else my barangay. The database already refuses a report made more than 15 km from the barangay it names.

**Honesty about alerts.** A web app cannot follow a phone's location in the background, so push and email alerts come for my barangay only. The viewing bar and the push prompt say so.

## How it is built

**1. My barangay can change while the app is open.** `setSelectedZoneId` also announces the change (a window event), and `useSelectedZone` subscribes to it and to the `storage` event, so the header, hotline button and every screen update without a reload. The stored value stays the plain id it is today, so phones set up before this keep their barangay.

**2. Changing it.** A `ChangeBarangayDialog` wraps the existing `ZonePicker`, with its confirm button reading "Make this my barangay". On pick it saves the barangay, then:
- Push: `usePushSubscription(zoneId)` already re-saves the browser's subscription when its barangay changes, so the home screen's `PushPrompt` must receive **my barangay** explicitly (it gets `zones[0]` today).
- Email: if the signed-in resident has email alerts on, call the existing `subscribe_email_alerts(zone)`; it moves the subscription. No database change.
- Offline map tiles: the precacher reads the new barangay on its next run.

The picker's "Use my location" checks consent first, as "How high am I?" now does.

**3. Viewing.** A `useViewedZone()` hook reads `?zone=` with `useSearchParams` and returns the barangay, or null when the parameter is missing, unknown or equal to my barangay. Next 16 requires a `<Suspense>` boundary around a client component that reads search parameters on a prerendered page (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`), so the part of `/` and `/evacuation` that reads it sits inside one. `HomepageMap` stops relying on `zones[0]` and takes three explicit props:
- `shownZone` (viewed, else mine): status headline, conditions, forecast, coverage note, map centre and title, flood-mode actions (evacuation links carry `?zone=` when viewing).
- `myZoneId`: `PushPrompt`.
- `reportZoneId` (where you are, else mine): `QuickDepthReport`.

The zone list keeps its order (shown barangay first) for the map, pins and routes. `/evacuation?zone=` shows that barangay's instructions; without it, my barangay's, as today.

**4. Where you are.** A `useWhereYouAre()` hook takes `useLivePosition()` (consent-gated already) and `findNearestZone` (`src/lib/nearest-zone.ts`) over the loaded barangays, within `NEAR_ZONE_METERS` (15 km). Everything happens on the phone: no position is sent anywhere for it. `useGeofenceAlert` keeps its own 2 km rule, and its message moves to bilingual text.

**5. Report target.** `reportZone = whereYouAre ?? myZone`, used by `QuickDepthReport` and `/report`, both of which show "Reporting for …". A report keeps the barangay it was tapped for, even if the resident walks on before it sends. The outbox's too-far message points to the home screen's Change button.

**6. Zones list.** Each card: **View** (`/?zone=id`, or `/` for my barangay) and **Evacuation** (`/evacuation?zone=id`). The "Your zone" card adds **Change**.

**7. Offline.** Pages are network-first. Any other page address with a query string (`/a` and sign-in keep their own handling) is fetched from the network but never stored under its own key, so each viewed barangay does not become a cache entry. Offline, it is answered with the cached page without the query (`ignoreSearch`), and the page reads `?zone=` itself, as `/a?d=` already does. Service worker version bump.

## Privacy

No change to the consent notice. "Where you are" is worked out on the phone from the position the notice already covers ("uses your location to suggest your barangay"; "follows your position" while Home or Report is open), and reports already carry the position. Without consent there is no "where you are": reports count for my barangay, and the picker's "Use my location" points to the notice.

## Not in this change

- Several saved barangays, or alerts for more than one. Push keeps one barangay per phone.
- Following the resident's location in the background.
- Matching by barangay boundary instead of the nearest centre. Near a border, "where you are" can be the neighbour; setup already has this limit.
- `profiles.zone_id`: nothing writes it today, so the account overview's "your barangay" stays as it is. A separate fix.

## Testing

- `useSelectedZone` re-renders when my barangay changes, in this tab and from another tab; an old plain stored id still reads.
- Changing my barangay: saves it, re-saves the push subscription for it, moves email alerts only when they are on, and says so.
- `useViewedZone`: missing, unknown and my own barangay all give null; `/` with `?zone=` shows that barangay under the viewing bar, and Back returns to mine.
- `useWhereYouAre`: nearest barangay within 15 km; null without consent, without a position, or beyond 15 km.
- Report target: GPS barangay when known, else mine; never the viewed barangay; the "Reporting for" line names it.
- Home: `PushPrompt` gets my barangay, `QuickDepthReport` gets the report target, and the rest gets the shown barangay, when all three differ.
- Zones list: View and Evacuation open the barangay on the card; no per-card Report.
- Danger banner in Filipino.
- Service worker: a navigation with a query is not stored under its own key and, offline, gets the cached page without the query.
