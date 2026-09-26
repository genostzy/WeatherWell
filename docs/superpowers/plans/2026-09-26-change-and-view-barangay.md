# Change Your Barangay, View Others, Report Where You Are — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Residents can change their own barangay, look at any other barangay with a way back, and have reports count for the barangay GPS puts them in.

**Architecture:** "My barangay" stays the id saved on the phone, now with a change event so screens follow it live. A viewed barangay comes from `?zone=` on `/` and `/evacuation`. "Where you are" is the nearest barangay centre to the live position, computed on the phone. The home screen keeps receiving its zone list with the shown barangay first, plus my barangay's id for push, and works out the report target itself.

**Tech Stack:** Next.js 16 App Router (client pages), React 19, Vitest + Testing Library, `public/sw.js`.

**Spec:** `docs/superpowers/specs/2026-09-26-change-and-view-barangay-design.md`

## Global Constraints

- Every user-facing string is a `LocalizedText` `{ en, fil }` rendered with `t(text, lang)`, with `lang={lang}` on the element that holds it.
- Before using a Next.js API, read its page under `node_modules/next/dist/docs/` (this Next.js differs from older versions). A client component that calls `useSearchParams` on a prerendered page must sit inside `<Suspense>`, or the production build fails.
- No new dependencies, no database migration.
- "Where you are" never leaves the phone: no request carries the position for it.
- Reports count for where you are, else my barangay; never for a barangay only being viewed.
- Push and email alerts follow my barangay only.
- Changing `public/sw.js` bumps its `VERSION`.
- Files are CRLF on disk; keep each file's line endings.
- Commits: author `Wilson <wilsondayritjrapex@gmail.com>`, no `Co-Authored-By` trailer. Work on `v1`; do not push.
- Checks before the last commit: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npx knip`, `npm run build`.

## Review Focus

1. `?zone=` holding an unknown id, garbage, or my own barangay's id: the home screen shows my barangay with no viewing bar (Task 3, `useViewedZone` tests).
2. GPS more than 15 km from every barangay, or no consent: no "You're in" line, and reports count for my barangay (Task 3 `findWhereYouAre` tests, Task 4 report tests).
3. Storage blocked (private browsing): changing the barangay says it could not be saved instead of confirming (Task 2).
4. Offline, opening `/?zone=X`: the cached home screen renders barangay X (Task 6).
5. Changing my barangay to the one being viewed: the viewing bar goes away, because the viewed id now equals mine (Task 3 `useViewedZone` test, with Task 1's change event).

---

### Task 1: My barangay changes live

**Files:**
- Modify: `src/features/onboarding/onboarding-storage.ts` (`setSelectedZoneId`, new `subscribeSelectedZone`)
- Modify: `src/features/zones/use-selected-zone.ts` (subscribe instead of the no-op)
- Test: `src/features/zones/use-selected-zone.test.tsx` (create), `src/features/onboarding/onboarding-storage.test.ts`

**Interfaces:**
- Produces: `setSelectedZoneId(zoneId: string): boolean` (true when the phone kept it); `subscribeSelectedZone(onChange: () => void): () => void` (fires on a same-tab change and on a `storage` event for `weatherwell.selectedZoneId`); `SELECTED_ZONE_EVENT = "weatherwell:selected-zone-changed"`.

- [ ] **Step 1: Write the failing tests**

In `use-selected-zone.test.tsx`, render `useSelectedZone` with the fixture reference data (`FIXTURE_REFERENCE_DATA` from `@/test-utils/render-with-data`, wrapped the way `renderWithData` provides it):
- `"follows a change of barangay made in this tab"`: start with `zones[0]` saved; `act(() => setSelectedZoneId(zones[1].id))`; expect `result.current.id` to be `zones[1].id`.
- `"follows a change made in another tab"`: `localStorage.setItem("weatherwell.selectedZoneId", zones[1].id)`, then `window.dispatchEvent(new StorageEvent("storage", { key: "weatherwell.selectedZoneId" }))` inside `act`; expect `zones[1].id`.
- `"still reads a barangay saved as a plain id before this change"`: `localStorage.setItem("weatherwell.selectedZoneId", zones[1].id)` before render; expect `zones[1].id`.

In `onboarding-storage.test.ts`, `"setSelectedZoneId says whether the phone kept it"`: expect `true` normally; with `vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); })`, expect `false`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/zones/use-selected-zone.test.tsx src/features/onboarding/onboarding-storage.test.ts`
Expected: the two "follows" tests fail (no re-render); the boolean test fails (returns undefined).

- [ ] **Step 3: Implement**

`setSelectedZoneId` returns `true` after a successful `setItem` and dispatches `new Event(SELECTED_ZONE_EVENT)` on `window`; `false` when storage throws. `subscribeSelectedZone` adds listeners for `SELECTED_ZONE_EVENT` and `storage` (only for that key) and returns their removal. `useSelectedZone` passes `subscribeSelectedZone` to `useSyncExternalStore`. The stored value stays a plain id.

- [ ] **Step 4: Run to verify they pass**

Run: the Step 2 command. Expected: PASS. Then `npx vitest run src/features src/app` still passes.

- [ ] **Step 5: Commit**

`git commit -m "feat: my barangay can change while the app is open"`

---

### Task 2: Change my barangay

**Files:**
- Create: `src/features/zones/change-barangay-dialog.tsx`
- Create: `src/lib/follow-email-alerts.ts`
- Modify: `src/features/onboarding/zone-picker.tsx` (`confirmLabel` prop; "Use my location" only with consent)
- Modify: `src/features/resident/email-alerts-card.tsx` (its mount effect calls `followEmailAlerts`)
- Test: `src/features/zones/change-barangay-dialog.test.tsx` (create), `src/lib/follow-email-alerts.test.ts` (create), `src/features/onboarding/zone-picker.test.tsx`

**Interfaces:**
- Consumes: `setSelectedZoneId(zoneId): boolean` (Task 1).
- Produces: `ChangeBarangayDialog({ onClose }: { onClose: () => void })`; `followEmailAlerts(zoneId: string): Promise<void>`; `ZonePicker({ onSelect, confirmLabel }: { onSelect: (zoneId: string) => void; confirmLabel?: LocalizedText })`.

Copy (exact):
- Dialog label: `{ en: "Change my barangay", fil: "Palitan ang aking barangay" }`
- Confirm: `{ en: "Make this my barangay", fil: "Gawin itong aking barangay" }`
- Saved: `{ en: "Alerts now come for {name}.", fil: "Para sa {name} na ngayon ang mga alerto." }`
- Not saved: `{ en: "Couldn't save this on this phone. If it is in private browsing, turn that off and try again.", fil: "Hindi ito maitabi sa teleponong ito. Kung naka-private browsing, patayin ito at subukan muli." }`
- Done: `{ en: "Done", fil: "Tapos na" }`

- [ ] **Step 1: Write the failing tests**

`follow-email-alerts.test.ts` (mock `@/lib/supabase/browser` so `from("email_alert_subscriptions").select("zone_id").maybeSingle()` resolves as given, and mock `@/app/actions/email-alerts`):
- `"moves email alerts to the new barangay"`: row `{ zone_id: "zone-1" }` → `subscribeEmailAlerts` called once with `"zone-2"`.
- `"does nothing without email alerts"`: row `null` → not called.
- `"does nothing when they already follow it"`: row `{ zone_id: "zone-2" }` → not called.

`change-barangay-dialog.test.tsx` (mock `@/lib/follow-email-alerts`; stub `fetch` so `/api/zones/search` returns one barangay `{ id: "zone-2", name: "Dos", municipality_name: "Testtown", province_name: "Test", lat: 14, lng: 121 }`, in the shape `zone-picker.test.tsx` already uses):
- `"makes the picked barangay mine and says alerts follow it"`: search, pick "Dos", press "Make this my barangay" → `getSelectedZoneId()` is `"zone-2"`, `followEmailAlerts` called with `"zone-2"`, and the text "Alerts now come for Dos." shows with a "Done" button that calls `onClose`.
- `"says so when the phone can't keep it"`: `Storage.prototype.setItem` throws → the not-saved text shows, "Alerts now come" does not, and `followEmailAlerts` is not called.

`zone-picker.test.tsx`:
- `"offers Use my location only after the consent notice"`: with `localStorage` cleared, no "Use my location" button; after `markConsented()`, it is there.
- `"names its confirm button as asked"`: `confirmLabel` given → the confirm button carries that text.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/follow-email-alerts.test.ts src/features/zones/change-barangay-dialog.test.tsx src/features/onboarding/zone-picker.test.tsx`
Expected: FAIL (modules missing; picker shows the location button without consent).

- [ ] **Step 3: Implement**

`followEmailAlerts` is the check `EmailAlertsCard` already makes on mount (read own `email_alert_subscriptions.zone_id`; if a row exists for another barangay, call `subscribeEmailAlerts(zoneId)`), moved to one place; errors are swallowed (a resident without an account has no row). `ChangeBarangayDialog` renders `OverlayDialog` (`@/components/overlay-dialog`) holding `ZonePicker` with the confirm label; on pick it calls `setSelectedZoneId`, then on `true` shows the saved text and awaits nothing (fires `followEmailAlerts`), on `false` shows the not-saved text. Push needs nothing here: `usePushSubscription` re-saves when its `zoneId` changes (Task 3 passes my barangay to it). In `ZonePicker`, render the "Use my location" button only when `hasConsented()`.

- [ ] **Step 4: Run to verify they pass**

Run: the Step 2 command, then `npx vitest run src/features/onboarding src/features/resident`. Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat: residents can change their barangay, and their alerts follow"`

---

### Task 3: Viewing another barangay

**Files:**
- Create: `src/features/zones/use-viewed-zone.ts`
- Create: `src/lib/where-you-are.ts`
- Create: `src/features/zones/barangay-bar.tsx`
- Modify: `src/app/page.tsx`, `src/features/homepage-map/homepage-map.tsx`, `src/features/homepage-map/flood-mode-actions.tsx`, `src/app/evacuation/page.tsx`, `src/features/onboarding/push-prompt.tsx`
- Test: `src/features/zones/use-viewed-zone.test.tsx`, `src/lib/where-you-are.test.ts`, `src/features/zones/barangay-bar.test.tsx` (all create), `src/features/homepage-map/homepage-map.test.tsx`, `src/features/homepage-map/flood-mode-actions.test.tsx`, `src/app/evacuation/page.test.tsx` (create), `src/features/onboarding/push-prompt.test.tsx`

**Interfaces:**
- Consumes: `useSelectedZone()`, `subscribeSelectedZone` (Task 1); `ChangeBarangayDialog` (Task 2); `findNearestZone`, `NEAR_ZONE_METERS` (`src/lib/nearest-zone.ts`).
- Produces: `useViewedZone(): Zone | null` (the `?zone=` barangay; null when missing, unknown, or my barangay); `findWhereYouAre(position: { lat: number; lng: number } | null, zones: readonly Zone[]): Zone | null` (nearest centre within 15 km); `BarangayBar({ shownZone, myZone, whereYouAre }: { shownZone: Zone; myZone: Zone; whereYouAre: Zone | null })`; `HomepageMap({ zones, myZoneId }: { zones: Zone[]; myZoneId?: string })` (default `zones[0].id`; `zones[0]` is the shown barangay); `FloodModeActions({ zone, viewing }: { zone: Zone; viewing?: boolean })`; `PushPrompt({ zoneId, zoneName }: { zoneId?: string; zoneName?: string })`.

Copy (exact):
- Change: `{ en: "Change", fil: "Palitan" }`
- Viewing: `{ en: "Viewing {name}. Your alerts still come for {mine}.", fil: "Tinitingnan ang {name}. Para pa rin sa {mine} ang iyong mga alerto." }`
- Back: `{ en: "Back to my barangay", fil: "Bumalik sa aking barangay" }`
- My location: `{ en: "My location", fil: "Aking lokasyon" }`
- You're in: `{ en: "You're in {name} now.", fil: "Nasa {name} ka ngayon." }` with a link `{ en: "View", fil: "Tingnan" }`
- Push prompt: `{ en: "Alerts come for {name}, your barangay, wherever you are.", fil: "Para sa {name}, ang iyong barangay, ang mga alerto saan ka man naroon." }`

- [ ] **Step 1: Write the failing tests**

`where-you-are.test.ts`: two fixture zones 5 km apart; a position 1 km from the second → the second; a position 20 km from both → `null`; `null` position → `null`.

`use-viewed-zone.test.tsx` (mock `next/navigation`'s `useSearchParams` to return the given `URLSearchParams`; my barangay saved as `zones[0].id`):
- `?zone=` absent → `null`; `?zone=nope` → `null`; `?zone=<zones[0].id>` → `null`; `?zone=<zones[1].id>` → `zones[1]`.
- `"stops viewing once the viewed barangay becomes mine"`: `?zone=<zones[1].id>`, then `act(() => setSelectedZoneId(zones[1].id))` → `null`.

`barangay-bar.test.tsx`:
- Not viewing (`shownZone === myZone`): shows my barangay's name and a "Change" button; clicking it opens the dialog labelled "Change my barangay". With `whereYouAre` another zone Y: "You're in Y now." and a "View" link to `/?zone=<Y.id>`. With `whereYouAre` equal to mine or `null`: no such line.
- Viewing X: "Viewing X. Your alerts still come for M." and a "Back to my barangay" link to `/`. With `whereYouAre` Y ≠ X: a "My location" link to `/?zone=<Y.id>`; with `whereYouAre` equal to M: "My location" links to `/`; with `whereYouAre` equal to X or `null`: no "My location".

`homepage-map.test.tsx` (mock `@/features/onboarding/push-prompt` to render `push:{zoneId}`):
- `"keeps push alerts on my barangay while showing another"`: render `<HomepageMap zones={[zones[1], zones[0]]} myZoneId={zones[0].id} />` → text `push:<zones[0].id>`, and the status headline names `zones[1]`.

`flood-mode-actions.test.tsx`: `viewing` → the evacuation link is `/evacuation?zone=<id>`; otherwise `/evacuation`.

`push-prompt.test.tsx`: `"says alerts follow my barangay, not where I am"`: `zoneName="Uno"` → "Alerts come for Uno, your barangay, wherever you are."; without `zoneName`, no such line.

`src/app/evacuation/page.test.tsx` (mock `useSearchParams`): `?zone=<zones[1].id>` → the heading names `zones[1]`; without it → my barangay; while viewing, the check-in panel is absent even when that barangay's alert is dangerous (a check-in is for your own barangay).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/where-you-are.test.ts src/features/zones src/features/homepage-map src/app/evacuation`
Expected: FAIL (modules missing; push prompt gets `zones[0]`; links lack `?zone=`).

- [ ] **Step 3: Implement**

- `findWhereYouAre` returns `findNearestZone(...)?.zone` when `isNear`, else `null`.
- `useViewedZone` reads `useSearchParams().get("zone")`, resolves it against `useZones()`, and compares with `useSelectedZone().id`.
- `BarangayBar` owns the dialog's open state and renders `ChangeBarangayDialog`.
- `page.tsx`: `HomeContent` computes `shown = useViewedZone() ?? useSelectedZone()`, orders the zones with `shown` first, passes `myZoneId`, and in the offline branch renders `BarangayBar` (with `whereYouAre={null}`) above `PersonalStatusHeadline zone={shown}`. Wrap `HomeContent` in `<Suspense>` (fallback: nothing; `OnboardingGate` already covers loading).
- `HomepageMap`: `whereYouAre = useMemo(() => findWhereYouAre(livePosition, zones), [livePosition, zones])`; render `BarangayBar` at the top of the status column with `myZone = zones.find((z) => z.id === myZoneId) ?? zones[0]`; `PushPrompt zoneId={myZoneId} zoneName={myZone.name}`; `FloodModeActions viewing={zones[0].id !== myZoneId}`.
- `evacuation/page.tsx`: move the body into a component inside `<Suspense>`; `zone = useViewedZone() ?? useSelectedZone()`; the check-in panel needs `!viewing` as well.

- [ ] **Step 4: Run to verify they pass**

Run: the Step 2 command, then `npx vitest run`. Expected: PASS.

- [ ] **Step 5: Build (the Suspense requirement only shows in a production build)**

Run: `npm run build`. Expected: succeeds, `/` and `/evacuation` still listed as static (`○`).

- [ ] **Step 6: Commit**

`git commit -m "feat: view another barangay, with a way back and to where you are"`

---

### Task 4: Reports count where you are, and the danger banner in Filipino

**Files:**
- Create: `src/features/water-level-report/reporting-for.tsx`
- Modify: `src/features/water-level-report/quick-depth-report.tsx`, `src/features/homepage-map/homepage-map.tsx`, `src/app/report/page.tsx`, `src/features/homepage-map/use-geofence-alert.ts`, `src/features/homepage-map/geofence-alert-banner.tsx`, `src/features/outbox/outbox-copy.ts`, `PRD.md` (Build Status: "Water-level reporting")
- Test: `src/features/water-level-report/quick-depth-report.test.tsx`, `src/features/homepage-map/homepage-map.test.tsx`, `src/app/report/page.test.tsx`, `src/features/homepage-map/geofence-alert-banner.test.tsx` (create)

**Interfaces:**
- Consumes: `findWhereYouAre` (Task 3), `useSelectedZone` (Task 1).
- Produces: `ReportingFor({ zoneName, whereYouAre }: { zoneName: string; whereYouAre: boolean })`; `QuickDepthReport({ zoneId, reportingFor }: { zoneId: string; reportingFor?: { zoneName: string; whereYouAre: boolean } })`; `useGeofenceAlert` returns `message: LocalizedText`.

Copy (exact):
- Where you are: `{ en: "Reporting for {name} (where you are)", fil: "Iuulat para sa {name} (kung nasaan ka)" }`
- Your barangay: `{ en: "Reporting for {name} (your barangay)", fil: "Iuulat para sa {name} (iyong barangay)" }`
- Danger banner: `{ en: "You are near {name}. Evacuate now!", fil: "Malapit ka sa {name}. Lumikas na ngayon!" }`, `{ en: "You are near {name}. Move to higher ground.", fil: "Malapit ka sa {name}. Pumunta sa mas mataas na lugar." }`, `{ en: "You are near {name}. Check conditions.", fil: "Malapit ka sa {name}. Tingnan ang kalagayan." }`
- Outbox too-far reason: `{ en: "Your location is outside this barangay, so the report can't count there. Turn on location so reports count where you are, or change your barangay on the home screen.", fil: "Nasa labas ka ng barangay na ito, kaya hindi mabibilang doon ang ulat. I-on ang lokasyon para mabilang ang ulat kung nasaan ka, o palitan ang iyong barangay sa home screen." }`

- [ ] **Step 1: Write the failing tests**

`quick-depth-report.test.tsx`: `"says which barangay the report counts for"`: `reportingFor={{ zoneName: "Dos", whereYouAre: true }}` → "Reporting for Dos (where you are)"; `whereYouAre: false` → "Reporting for Dos (your barangay)".

`homepage-map.test.tsx` (stub `navigator.geolocation.watchPosition` with a position; `markConsented()`):
- `"reports count where GPS puts you, not the barangay on screen"`: zones `[X (shown), M, Y]`, `myZoneId` M, position 1 km from Y → tap Knee-deep → the outbox entry's `payload.zoneId` is Y's id, and "Reporting for Y (where you are)" shows.
- `"with GPS far from every barangay, reports count for my barangay"`: position 50 km away → `payload.zoneId` is M's id, "(your barangay)".

`report/page.test.tsx`: `"files for where you are when GPS knows it"` (position near another fixture zone → the heading and the outbox entry use it) and `"files for my barangay without consent"` (no `markConsented`) → my barangay.

`geofence-alert-banner.test.tsx`: the banner renders the Filipino text with `lang="fil"` for a dangerous zone.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/water-level-report src/features/homepage-map src/app/report`
Expected: FAIL.

- [ ] **Step 3: Implement**

`ReportingFor` renders one line with `lang={lang}`. `QuickDepthReport` renders it above the depth buttons when `reportingFor` is given. `HomepageMap`: `reportZone = whereYouAre ?? myZone`; `QuickDepthReport zoneId={reportZone.id} reportingFor={{ zoneName: reportZone.name, whereYouAre: whereYouAre !== null }}`. `report/page.tsx`: `zone = useMemo(() => findWhereYouAre(position, zones), …) ?? useSelectedZone()`, used for the heading, the report and the panel, with `ReportingFor` under the heading. `useGeofenceAlert` builds the message from the three texts; the banner renders `t(message, lang)`. Replace `TOO_FAR_REASON`'s text. PRD Build Status, "Water-level reporting": add that a report counts for the barangay GPS puts you in, else your own, and says which.

- [ ] **Step 4: Run to verify they pass**

Run: the Step 2 command, then `npx vitest run`. Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat: reports count where you are, and the danger banner speaks Filipino"`

---

### Task 5: The Zones list opens the barangay you tap

**Files:**
- Modify: `src/features/zones/zone-map.tsx`, `PRD.md` (Build Status: "Onboarding, consent, barangay selection"), `README.md` (Screens: `/` and `/evacuation` take `?zone=`)
- Test: `src/features/zones/zone-map.test.tsx`

**Interfaces:**
- Consumes: `ChangeBarangayDialog` (Task 2).

Copy (exact): View `{ en: "View", fil: "Tingnan" }`; Change `{ en: "Change", fil: "Palitan" }` (Evacuation keeps its text).

- [ ] **Step 1: Write the failing tests**

`zone-map.test.tsx`:
- `"opens the barangay on the card, not your own"`: for a card that is not mine, "View" links to `/?zone=<id>` and "Evacuation" to `/evacuation?zone=<id>`; for my card, `/` and `/evacuation`.
- `"has no Report button on a card"`: no link to `/report` inside any card.
- `"lets you change your barangay from your own card"`: my card has "Change", which opens the "Change my barangay" dialog; other cards don't have it.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/features/zones/zone-map.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

Replace the per-card Evacuation/Report buttons with View and Evacuation carrying the card's zone; add Change on my card (open state in the card). Update the two docs rows: residents can change their barangay from the home screen or the Zones list, and view any barangay with a way back.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/features/zones`. Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat: the Zones list opens the barangay you tap"`

---

### Task 6: Viewing works offline

**Files:**
- Modify: `public/sw.js` (navigation branch; `VERSION` to `"v20"`)
- Test: `src/lib/service-worker.test.ts`

- [ ] **Step 1: Write the failing tests**

With the existing `loadServiceWorker` harness:
- `"a page address with a query is never stored under its own key"`: online navigation to `/?zone=zone-2` → `SHELL_CACHE` has no `/?zone=zone-2` entry.
- `"offline, a page address with a query gets the cached page without it"`: `/` cached, network failing, navigation to `/?zone=zone-2` → responds with the cached `/`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/service-worker.test.ts`. Expected: the two new tests FAIL.

- [ ] **Step 3: Implement**

In the navigation branch, when `url.search` is set: fetch from the network without storing; on failure answer `caches.match(url.origin + url.pathname)`, else `Response.error()`. The `/a?d=` and sign-in branches above it are unchanged. Bump `VERSION`.

- [ ] **Step 4: Run all checks**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npx knip`, `npm run build`. Expected: all pass (lint's two existing warnings aside).

- [ ] **Step 5: Commit**

`git commit -m "feat: a viewed barangay opens offline from the cached page"`
