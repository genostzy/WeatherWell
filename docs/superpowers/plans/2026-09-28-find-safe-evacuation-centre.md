# Find Safe Evacuation Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Find safe evacuation center" and "Find safe area" point to the nearest usable place from where the resident is, with a walking route checked against barangays under alert and residents' blocking pins.

**Architecture:**
- **The choosing:** a pure `findSafeDestination` in `src/lib/safe-route.ts` picks candidates and asks an injected router for alternatives. It returns the first clean route, or the least-affected route with its problems.
- **The screen:** a `useSafeRoute` hook runs it on a tap and replaces `use-route-finding.ts`. `HomepageMap` draws the route and a panel.
- **Routing:** `/api/route` switches to the free FOSSGIS walking router and returns every alternative.

**Tech Stack:** Next.js 16 App Router, React 19, react-leaflet, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-28-find-safe-evacuation-centre-design.md`

## Global Constraints

- **Distances:**
  - Usable destinations are within 10 km of the start, in a straight line.
  - A route is unclean if it comes within 500 m of the point of a barangay under Warning or Evacuate (ZoneStatus `dangerous` or `hazardous`). The start barangay doesn't count.
  - It is also unclean if it comes within 50 m of a blocking pin: `road_blocked`, `landslide`, `power_line_down` or `impassable`, not removed, made in the last 24 hours.
  - Distances to the route are point-to-segment.
- **Routing:**
  - The router is `https://routing.openstreetmap.de/routed-foot`, overridable by `OSRM_BASE_URL`.
  - Request `…/route/v1/foot/<lng,lat>;<lng,lat>?overview=full&geometries=geojson&alternatives=3`, with header `User-Agent: WeatherWell (flood evacuation app)`.
  - Timeout 8 seconds.
  - Try at most 3 candidates.
- **Order:** confirmed centres first. Likely sites (`/api/evacuation-candidates?zoneId=`) are used only when no confirmed centre is within 10 km, and they are marked.
- Positions go only in POST bodies, never in an address.
- The consent sentence and `CONSENT_VERSION = "2026-09-28"` are exactly as in the spec's "The consent notice" section.
- Every user-facing string is a `LocalizedText` rendered with `t(text, lang)`, with `lang={lang}` on the element.
- One service worker version bump for this plan. Pins' plan uses v22, so this one uses `VERSION = "v23"`.
- Keep each file's line endings. Helper scripts go in the session scratchpad. Commits are authored by Wilson <wilsondayritjrapex@gmail.com>, with no attribution lines.

## Review Focus

1. Location off or not allowed: the search starts from the resident's barangay point and says so (Task 3).
2. The router is down or slow: the destination is still named, with a straight-line route marked as such, never an empty panel (Tasks 1 and 2).
3. The resident's own barangay is under Evacuate: every route starts inside it, so it must not make every route "unclean" (Task 2).
4. The likely-sites search (OpenStreetMap) fails: "No evacuation centre found near you" with the call button, not a crash or a spinner forever (Task 2).
5. Tapping the button twice quickly: one search's result shows, the latest, and no stale route replaces it (Task 3).

---

### Task 1: The walking router

**Files:**
- Create: `src/lib/route-types.ts`
- Modify: `src/app/api/route/route.ts`, `src/app/api/route/route.test.ts`

**Interfaces:**
- Produces: `POST /api/route` with body `{ from: [lat, lng], to: [lat, lng] }` answers `{ routes: RouteOption[], fallback: boolean }`, where `RouteOption = { polyline: [number, number][]; distanceMeters: number | null; durationSeconds: number | null }`.
  - Normally it returns every alternative the router gives, with `fallback: false`.
  - On an error or a timeout it returns one straight line `[from, to]` with nulls and `fallback: true`.
- `RouteOption` and `RouteResponse` live in `src/lib/route-types.ts` (types only), imported by the route and by the client, so client code never imports a server route file.

- [ ] **Step 1: Update the tests to the new contract (they fail)**
  - "asks the walking router for alternatives, with the app's name": `fetch` is called with a URL starting `https://routing.openstreetmap.de/routed-foot/route/v1/foot/120.4366,16.0288;120.44,16.03?` that contains `alternatives=3`, with a `User-Agent` header containing `WeatherWell`.
  - "returns every alternative": a router answer with 2 routes gives 2 `RouteOption`s, whose polylines are `[lat, lng]` pairs.
  - "falls back to a straight line, marked, when the router fails or is slow": a rejected `fetch` gives `{ routes: [{ polyline: [from, to], distanceMeters: null, durationSeconds: null }], fallback: true }`.
  - Keep "has no GET…" and "refuses a missing or non-numeric point".
- [ ] **Step 2: Run.** `npx vitest run src/app/api/route` — Expected: FAIL (the driving URL; a single route; no `routes`).
- [ ] **Step 3: Implement** as in Interfaces and Global Constraints.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add src/app/api/route src/lib/route-types.ts
git commit -m "feat: directions come from a free walking router, with alternatives"
```

---

### Task 2: Choosing a safe destination

**Files:**
- Create: `src/lib/safe-route.ts` (+ `safe-route.test.ts`)

**Interfaces:**
- Consumes: `RouteOption`, `RouteResponse` from `src/lib/route-types.ts` (Task 1), and these existing helpers:
  - `hasRealEvacuationCenter`;
  - `resolveEffectiveCenterStatus`;
  - `getZoneStatus`;
  - `CandidateSite` (`src/lib/osm-candidates.ts`);
  - `CommunityPin` (`src/lib/community-pins.ts`).
- Produces:
  - `SAFE_RADIUS_M = 10_000`, `ZONE_CLEARANCE_M = 500`, `PIN_CLEARANCE_M = 50`, `PIN_MAX_AGE_MS = 24 * 3600 * 1000`, `MAX_CANDIDATES = 3`.
  - `type LatLng = { lat: number; lng: number }`.
  - `type Destination`:
    - `{ kind: "centre"; zone: Zone; name: string } & LatLng`, with the centre's point;
    - `{ kind: "likely"; site: CandidateSite; name: string } & LatLng`;
    - `{ kind: "area"; zone: Zone; name: string } & LatLng`, with the barangay's point.
  - `type RouteProblem = { kind: "pin"; pin: CommunityPin; metresFromStart: number } | { kind: "zone"; zone: Zone }`.
  - `interface SafeRouteResult { status: "found" | "none"; destination?: Destination; route?: RouteOption; problems: RouteProblem[]; fallback: boolean }`.
  - `distanceToRouteMeters(point: LatLng, polyline: [number, number][]): number`: the minimum point-to-segment distance, in metres, on a local equirectangular projection about the point.
  - `blockingPins(pins: CommunityPin[], now: number): CommunityPin[]`.
  - `routeProblems(polyline, { dangerZones: Zone[]; pins: CommunityPin[]; startZoneId: string | null }): RouteProblem[]`. `startZoneId` is excluded from `dangerZones`. A pin problem's `metresFromStart` is the distance along the route to the closest point, rounded to 10 m.
  - `findSafeDestination(input): Promise<SafeRouteResult>`. The input:
    ```ts
    {
      from: LatLng;
      startZoneId: string | null;
      zones: Zone[];
      statusOf: (zoneId: string) => ZoneStatus;
      pins: CommunityPin[];
      now: number;
      fetchRoutes: (from: LatLng, to: LatLng) => Promise<RouteResponse>;
      fetchLikelySites: () => Promise<CandidateSite[]>;
    }
    ```
  - `findSafeArea(input)`: the same input without `fetchLikelySites`. Its only candidates are barangays whose status is `safe`, as `kind: "area"`.
- Behaviour:
  - Candidates are:
    - confirmed centres in zones that aren't `dangerous` or `hazardous`, whose effective centre status isn't `full`, within `SAFE_RADIUS_M`, nearest first;
    - otherwise the likely sites from `fetchLikelySites()` within `SAFE_RADIUS_M`, nearest first.
  - For each of the first `MAX_CANDIDATES`, it fetches routes and returns the first alternative with no problems.
  - If none is clean, it returns the first candidate's route with the fewest problems, and all of them.
  - A `fallback` straight line is checked the same way, and `fallback: true` is passed on.
  - No candidates means `{ status: "none", problems: [], fallback: false }`.
  - A `fetchLikelySites` rejection counts as an empty list.

- [ ] **Step 1: Write the failing tests** (`safe-route.test.ts`, synthetic zones and a fake `fetchRoutes`)
  - "sends a resident whose barangay is under Evacuate to the nearest other centre, not the next barangay in the list": the list is `[own (hazardous), far (safe, first in list, 300 km away), near (safe, 3 km)]`, so the destination is `near`.
  - "skips barangays under Warning or Evacuate, and full centres".
  - "prefers a confirmed centre within 10 km to a nearer likely site, and marks likely sites when they are all there is": with a confirmed centre at 8 km and a likely site at 1 km, `kind` is `"centre"`. With no confirmed centre, `kind` is `"likely"`.
  - "says nothing is near when nothing is within 10 km": `status: "none"`.
  - "takes the first clean alternative": the first route passes 30 m from a `road_blocked` pin, the second is clean, so the second is chosen with `problems: []`.
  - "tries the next place when every route to the nearest is blocked".
  - "returns the least-affected route, with its problems, when every route is": `problems` lists the pin and the barangay.
  - "does not count the barangay the resident starts in".
  - "ignores removed pins, pins over 24 hours old, flood pins that are not Impassable, and pins over 50 m away".
  - "measures to the route's segments, not only its corners": a pin 20 m from the middle of a 1 km straight segment is a problem.
  - "treats a failed likely-site search as none found": `fetchLikelySites` rejects, so `status: "none"`.
  - "keeps the destination when the router falls back to a straight line": `fallback: true`, with the destination named.
  - `findSafeArea` "picks the nearest barangay with no alert, not the first in the list".
- [ ] **Step 2: Run.** `npx vitest run src/lib/safe-route.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add src/lib/safe-route.ts src/lib/safe-route.test.ts
git commit -m "feat: choose the nearest usable place, with a route clear of alerts and blocked roads"
```

---

### Task 3: The home screen

**Files:**
- Create: `src/features/homepage-map/use-safe-route.ts` (+ `.test.ts`)
- Modify:
  - `src/features/homepage-map/homepage-map.tsx` (+ `homepage-map.test.tsx`);
  - `src/features/homepage-map/map-canvas.tsx` (+ `map-canvas.test.tsx`).
- Delete: `src/features/homepage-map/use-route-finding.ts`, `route-hazard.ts` and their tests.

**Interfaces:**
- Consumes: `findSafeDestination`, `findSafeArea`, `SafeRouteResult`, `Destination` (Task 2); `POST /api/route` (Task 1).
- Produces: `useSafeRoute({ zones, livePosition, startZone }): { result: SafeRouteResult | null; searching: boolean; fromBarangay: boolean; offline: boolean; findCentre(): void; findArea(): void; routeToZone(zoneId: string): void; recalculate(): void }`.
  - `startZone` is `whereYouAre ?? myZone`.
  - The start is `livePosition`, else `startZone`'s point, in which case `fromBarangay` is true.
  - Offline (`navigator.onLine` false): it routes nothing. `result` becomes the nearest usable confirmed centre by straight line, with `offline: true`.
  - A second call while a search runs supersedes it: only the latest search's result is kept.
  - `routeToZone` is the marker click. It routes from the start to that zone's centre (or its point) through `/api/route` and lists problems, with no candidate search.
  - Nothing is fetched until a call.
- `MapCanvas` props: `routeZone`/`routeHazard`/`effectiveRoutePolyline` become `route: { polyline: [number, number][]; problems: boolean } | null` and `destination: LatLng | null`. The route draws in teal, or dashed dark red when it has problems.

The panel copy (English / Filipino):
- `"{distance} · {minutes} min walk to {name}"` / `"{distance} · {minutes} minutong lakad papunta sa {name}"`
- `"Not confirmed by your barangay"` / `"Hindi pa kumpirmado ng barangay"`
- `"Avoids barangays under Warning or Evacuate and blocked roads reported by residents"` / `"Iniiwasan ang barangay na may Warning o Evacuate at mga saradong daan na iniulat ng residente"`
- `"This route passes a {type} pin (about {metres} m from you)"` / `"Dumadaan ang rutang ito sa {type} pin (mga {metres} m mula sa iyo)"`
- `"This route passes near {barangay}, under {alert}"` / `"Dumadaan ang rutang ito malapit sa {barangay}, na may {alert}"`
- `"From your barangay — turn on location for directions from where you are"` / `"Mula sa iyong barangay — i-on ang lokasyon para sa direksyon mula sa kinaroroonan mo"`
- `"Offline — straight line, not a road route"` / `"Offline — tuwid na linya, hindi daan"`
- `"Straight line — the route planner didn't answer"` / `"Tuwid na linya — hindi sumagot ang route planner"`
- `"No evacuation centre found near you — go to higher ground and call your barangay or 911"` / `"Walang evacuation center na malapit sa iyo — pumunta sa mas mataas na lugar at tumawag sa barangay o 911"`
- `"Nearest barangay with no alert: {name}"` / `"Pinakamalapit na barangay na walang alerto: {name}"`
- `"Recalculate"` / `"Kalkulahin muli"`
- The call link: `telHref` of the first of `hotlinesOf(startZone)`, else 911. Label: "Call {number}" or "Call 911".

- [ ] **Step 1: Write the failing tests**
  - `use-safe-route.test.ts`, with `fetch` stubbed for `/api/route` and `/api/evacuation-candidates`:
    - "fetches nothing until asked".
    - "starts from the barangay, and says so, without a position".
    - "keeps only the latest search's result when asked twice": the first `/api/route` resolves after the second, and the second's destination wins.
    - "offline, gives the nearest centre in a straight line and routes nothing".
  - `homepage-map.test.tsx`: replace the four route tests that mock `./route-hazard` with:
    - "Find safe evacuation center names the place, the walk and what was checked".
    - "says what a route passes when every route is affected".
    - "Find safe area names the nearest barangay with no alert".
    - "shows the call button with the barangay's hotline, or 911".
    - "says nothing is near, with the call button, when nothing is in reach".
    - Keep "does not reveal evacuation centers from 'Find safe area' alone", "marks which quick action's route is on the map", and the rest unchanged.
  - `map-canvas.test.tsx`:
    - "draws the route it is given": a `route` prop renders one polyline, and `null` renders none.
- [ ] **Step 2: Run.** `npx vitest run src/features/homepage-map` — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The compass line keeps using `livePosition` and the destination's point.
  - A marker click calls `routeToZone` and clears the active quick action, as today.
  - Delete the old hook, `route-hazard.ts` and their tests.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add -A src/features/homepage-map
git commit -m "feat: Find safe evacuation center points to the nearest usable place, from where you are"
```

---

### Task 4: Consent, service worker and docs

**Files:**
- Modify:
  - `src/features/onboarding/consent-notice.tsx`;
  - `src/features/onboarding/onboarding-storage.ts` (+ tests);
  - `public/sw.js`;
  - `PRD.md`, `README.md`.

- [ ] **Step 1: Write the failing tests**
  - `consent-notice.test.tsx`:
    - "names the walking route planner": the English text contains `routing.openstreetmap.de` and "walking route planner", and not `router.project-osrm.org`.
  - `onboarding-storage.test.ts`:
    - A stored consent of version `2026-09-25` no longer counts as consented; `2026-09-28` does.
- [ ] **Step 2: Run.** `npx vitest run src/features/onboarding` — Expected: FAIL.
- [ ] **Step 3: Implement**
  - The sentence from the spec, in both languages.
  - `CONSENT_VERSION = "2026-09-28"`.
  - `VERSION = "v23"` in `public/sw.js`.
  - PRD:
    - "Directions to the centre": walking routes from FOSSGIS with alternatives, checked against barangays under Warning or Evacuate and residents' blocking pins, from the resident's position;
    - "Evacuation guidance";
    - the consent version.
  - README where it names the router.
- [ ] **Step 4: Check the whole suite and the build**
Run: `npm test && npm run typecheck && npm run lint && npm run knip && npm run build`
Expected: all pass; lint shows only the two existing warnings in `src/app/api/historical-events/route.test.ts`.
- [ ] **Step 5: Commit**
```bash
git add src/features/onboarding public/sw.js PRD.md README.md
git commit -m "docs: the consent notice names the walking route planner"
```
