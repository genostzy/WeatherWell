# "Find safe evacuation center" that points somewhere safe — Design

**Date:** 28 September 2026 · **Status:** design, for the owner's review

## Why

The button does not do what its name says (`src/features/homepage-map/use-route-finding.ts`):
- **It picks by list order, not distance.** It takes the first barangay in the nationwide list that is not under Warning or Evacuate. Normally that is the resident's own; when their barangay *is* under Warning or Evacuate — the moment the button matters — it is the next barangay in the list, Adams, Ilocos Norte, hundreds of kilometres from a Pangasinan resident. "Find safe area" has the same fault and calls its pick the "nearest safe zone".
- **The line on the map starts at the barangay's centre point, not at the resident.** Only the "350 m NE" text uses GPS, and it is a straight line.
- **The hazard check never looks at the real route.** It checks each barangay's stored route path, which is a single placeholder point for all 41,803 barangays.
- **The route is a car route** from the public OSRM demo server, and it knows nothing of floods, blocked roads or landslides.
- **Almost no barangay has a confirmed centre** (one so far), and the likely sites the app already finds on OpenStreetMap are not used for directions.

## Decisions (owner, 28 September)

- **Walking routes,** from the free walking router at `routing.openstreetmap.de` (no account). The consent notice names it, so its version goes up and every resident confirms it once.
- **Confirmed centres first; otherwise the nearest likely sites** from OpenStreetMap, marked "Not confirmed by your barangay". The call button always shows.
- **Residents' pins steer the route:** the app asks for a few alternative routes and shows the first that passes no blocking pin and no barangay under Warning or Evacuate; if every route passes one, it shows the best and says exactly what is on it. Pins never hide a centre.

## What residents see

**"Find safe evacuation center."**
- **Where it starts:** the live position if location is on; otherwise the resident's barangay's point, and it says so ("From your barangay — turn on location for directions from where you are").
- **Where it points:** the nearest usable place within 10 km in a straight line. Confirmed centres come first; only when none is within 10 km, the nearest likely sites from OpenStreetMap (schools, halls, community centres, covered courts), marked "Not confirmed by your barangay". A place is not usable when its barangay is under Warning or Evacuate (the statuses the app calls Dangerous and Hazardous), or when the centre is Full.
- **What it shows:** the place's name; the walking distance and time; the route line on the map from the resident to the place; and what was checked:
  - "Avoids barangays under Warning or Evacuate and blocked roads reported by residents"; or, when every route passes something,
  - exactly what is on it: "This route passes a Road blocked pin (about 120 m from you)" / "passes near Barangay X, under Evacuate".
  - The call button: the barangay's hotline, or 911.
- **"Recalculate"** asks again from the current position.
- **Nothing within 10 km:** "No evacuation centre found near you — go to higher ground and call your barangay or 911", with the call button.
- **Offline:** a straight-line direction and distance to the nearest usable confirmed centre from the saved barangay data, marked "Offline — straight line, not a road route".

**"Find safe area"** gets the same fix: the nearest barangay with no alert at all, measured from the resident (or their barangay's point), not by list order, with a walking route to its point. Its notice says "Nearest barangay with no alert: X", which is what it now is.

## How it chooses

One tested function on the phone, `findSafeDestination`, in a new `src/lib/safe-route.ts`:
1. **Candidates.** Every zone with a real centre (`hasRealEvacuationCenter`), and, only when none of those is within 10 km, the likely sites for the barangay the resident is in (`whereYouAre ?? myZone`), from the existing `/api/evacuation-candidates`. Drop any whose barangay is Dangerous or Hazardous, and any centre whose effective status is Full (`resolveEffectiveCenterStatus`). Keep those within 10 km of the start, sorted by straight-line distance.
2. **Routes.** For the nearest candidate, ask the router for up to 3 alternative walking routes. A route is **clean** when it:
   - comes no closer than 500 m to the point of any barangay under Warning or Evacuate, other than the resident's own starting barangay;
   - comes no closer than 50 m to any community pin that is Road blocked, Landslide, Power line down, or a flood pin marked Impassable, is not removed, and was made in the last 24 hours.
3. **Pick.** The first clean route to the nearest candidate. Otherwise try the next candidate, up to 3 candidates. If none has a clean route, show the route with the fewest problems to the nearest candidate, and list its problems.
4. **Honesty.** The app knows each barangay's centre point, not its boundary, so "passes near a barangay under alert" is an approximation; the text says "near", never "through".

Distances between the route and a point use a point-to-segment distance on each segment of the route line (metres, on a local flat approximation), not only the route's vertices.

## Routing

`POST /api/route` keeps its shape (`{ from, to }` in the body, never the address) and returns `{ routes: [{ polyline, distanceMeters, durationSeconds }], fallback }`:
- It asks `https://routing.openstreetmap.de/routed-foot/route/v1/foot/<lng,lat>;<lng,lat>?overview=full&geometries=geojson&alternatives=3`, with a `User-Agent` naming WeatherWell, as the service's usage policy asks.
- `OSRM_BASE_URL` still overrides the base, for a self-hosted router later.
- On a failure or a timeout (8 seconds), it returns one straight-line "route" with `fallback: true`, which the screen labels.

`use-route-finding.ts` is replaced by a `useSafeRoute` hook that runs `findSafeDestination` on a tap, fetches routes in order, and exposes `{ destination, route, problems, status }` to `HomepageMap`, which draws the route and the panel. The live compass line ("350 m NE") stays.

## The consent notice

The location item's routing sentence becomes (English / Filipino):
- "Directions to an evacuation centre are worked out by a free public walking route planner run by FOSSGIS (routing.openstreetmap.de), which receives your position and the centre's; WeatherWell does not store them."
- "Kinukuwenta ang lakad papunta sa evacuation center ng isang libreng pampublikong route planner ng FOSSGIS (routing.openstreetmap.de), na tumatanggap ng iyong posisyon at ng sa center; hindi ito iniimbak ng WeatherWell."

`CONSENT_VERSION` goes to `2026-09-28`, so every resident sees the notice once more.

## Rollout

No database change. The service worker version goes up with this release, so phones take the new code on their next open. An older copy of the app that calls `/api/route` before it updates reads no `polyline` in the new answer and falls back to the barangay's stored path, as it does today when the router fails. The consent version bump shows every resident the notice once, on their next open.

## Not in this change

- A self-hosted router; routing that treats a barangay's real boundary as the area to avoid (the data has centre points only).
- Showing officials' markers ("Blocked road") to residents, or routing around them. A later "Show to residents" switch on markers would feed the same check.
- Re-routing continuously as the resident walks, and turn-by-turn directions.
- Choosing the destination by walking time rather than straight-line distance.

## Testing

- **`findSafeDestination`** (pure, with a fake router):
  - picks the nearest usable place by distance, not list order — the Adams case: a resident whose own barangay is under Evacuate is sent to the nearest other centre, not the next in the list;
  - skips Dangerous and Hazardous barangays and Full centres;
  - prefers a confirmed centre within 10 km to a nearer likely site; uses likely sites only when no confirmed centre is within 10 km, and marks them;
  - returns "nothing within 10 km" when that is so;
  - takes the first clean alternative; moves to the next candidate when all of one candidate's routes are blocked; returns the least-affected route with its problems when every route is;
  - ignores removed pins, pins older than 24 hours, flood pins that are not Impassable, and pins more than 50 m from the route line;
  - flags a route passing between two vertices within 50 m of a pin (the segment distance, not only the vertices).
- **`/api/route`:** calls the walking router with `alternatives=3` and the User-Agent; returns every alternative; falls back to a straight line on an error or a timeout.
- **The screen:** the panel's name, distance, time, "Not confirmed" label, checked line and problem lines; "From your barangay" without location; the offline straight-line text; the no-centre case; Recalculate; "Find safe area" naming the nearest barangay with no alert.
- **Consent:** the new routing sentence and version.
