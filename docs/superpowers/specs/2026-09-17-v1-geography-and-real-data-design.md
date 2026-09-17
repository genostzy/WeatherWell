# V1 — Geography and Real Data: Design Spec

> **Status:** Draft. To be reviewed before implementation begins.

**Goal:** Replace the 4-demo-barangay mock dataset with the nationwide Philippine barangay list, real PAGASA weather data, real hazard susceptibility, offline map tiles, real routing, and the threshold alert engine with Web Push delivery.

**Exit criteria (from PRD Stage 3):** A genuine crowd-report scenario auto-triggers an alert and delivers it via push with retry — end to end, no mocks in the path.

---

## 1. Sub-projects

V1 decomposes into five sub-projects, ordered by dependency. Each ships independently; the exit criteria require all five.

### 1.1 Nationwide Barangay List

**What:** Replace the 4 seeded zones with ~42,000 Philippine barangays from PSA's PSGC dataset.

**Changes:**
- **Seed script** (`scripts/generate-seed.ts`): Source from PSA's published PSGC list. Each barangay becomes a `zones` row with its 10-digit PSGC code, name, municipality, province, and center coordinates (centroids from OpenStreetMap or PSA boundary data).
- **Evacuation centres:** One `evacuation_centers` row per zone, initially with `status = 'unknown'` and null capacity. Barangays without a known centre get a placeholder; the operator fills it in.
- **Hazard susceptibility:** Initially all `'unknown'` per zone. Real DENR-MGB data replaces this in 1.2.
- **POIs:** Sparse. Only populated where real data exists (hospitals, fire stations, etc. from OSM).
- **`findNearestZone`** (`src/lib/nearest-zone.ts`): Switch from center-point distance to point-in-polygon when boundary GeoJSON is available. Until then, keep center-point matching but raise the threshold and add a search-by-name fallback.
- **`ZonePicker`** (`src/features/onboarding/zone-picker.tsx`): Replace the flat `RadioGroup` of 4 zones with a search/autocomplete that filters ~42k zones by name. Show the user's detected barangay (from GPS) first if within threshold.
- **`/api/zones` route:** With ~42k zones, the single fetch may be too large. Options:
  - Keep it simple: 42k zones × ~200 bytes = ~8MB JSON. Gzipped ~800KB. Acceptable for a one-time load that gets cached by the service worker.
  - If too slow: scope to the user's municipality/province after GPS detection, and refetch when they move.
- **Service worker cache:** `ZONE_CACHE` (stale-while-revalidate) already handles this. The unversioned cache survives deploys, which is correct — zone data changes rarely.
- **`toReferenceData`** (`src/lib/reference-data/types.ts`): Widen to handle zones without evacuation centres (make `evacuationCenter` optional on the `Zone` type). 23+ files depend on `Zone` — this is the riskiest type change.

**Data source:** PSA's PSGC dataset. Download the Excel/CSV from psa.gov.ph, parse with a script. Centroids from OSM's `admin_level=9` boundaries or PSA's own coordinate data.

**Parked items addressed:**
- V1 hazard data will be mostly "unknown" — designed for this.
- `appoint_official` name resolution with duplicates — already uses `string_agg`.

### 1.2 Real PAGASA and Hazard Data

**What:** Replace mock weather data with real PAGASA feeds, and real DENR-MGB hazard susceptibility.

**PAGASA data (in order of preference, per PRD):**
1. **PAGASA's own APIs** (Ten-Day Forecast, Seasonal Forecast). Not self-serve — requires formal data request. **Start this request now** (Stage 2 said to begin early).
2. **PAGASA's public file server** (`pubfiles.pagasa.dost.gov.ph`). Date-prefixed PDF bulletins. Polling stable file paths.
3. **`pagasa-parser-web`** (community wrapper, AGPL-3.0). Client-only usage is safe. No uptime commitment — behind cache-and-degrade.

**What becomes real:**
- `getRainfallForZone` → PAGASA rainfall data (mapped to zone by coordinates)
- `getRainfallHistoryForZone` → PAGASA historical rainfall
- `hasThunderstormWatch` → PAGASA thunderstorm watch bulletin
- `getWindForZone` → PAGASA wind data
- `MOCK_TYPHOON` → PAGASA/JTWC tropical cyclone track (null when no active system)
- `getHeatIndexForZone` → PAGASA heat index (drop if no programmatic source per PRD)
- `getHazardSusceptibilityForZone` → DENR-MGB geohazard maps

**Architecture:**
- **Server-side ingestion**, scheduled (cron or GitHub Action). Never scraped per-request from a resident's device.
- **New Postgres tables:** `weather_readings` (per-zone, timestamped), `hazard_alerts` (PAGASA bulletins), `typhoon_tracks` (active system positions).
- **New API routes:** `/api/weather` (current readings per zone), `/api/typhoon` (active track).
- **Risk engine** (`src/lib/risk-engine/score.ts`): Already reads from `ZoneInput` — swap the mock data functions for real DB queries. No structural change to the engine itself.

**Parked items addressed:**
- Late reports count toward flood consensus — the time window question applies here too (how fresh must weather data be?).
- V1 hazard data will be mostly "unknown" until DENR-MGB data is ingested.

### 1.3 Offline Map Tiles

**What:** Cache map tiles per-zone so the map works during an outage.

**Current state:** OSM raster tiles loaded from CDN. No caching. Basemap disappears offline → falls back to zone-alert list.

**Design:**
- **Per-zone tile set:** For each zone, pre-cache the tiles visible at the evacuation-relevant zoom levels (12–15) within a ~2km radius of the zone centre.
- **Storage budget:** ~50 tiles per zone × 42k zones = 2.1M tiles. At ~20KB each = ~42GB. **Not feasible for all zones.**
- **Scoping:** Cache tiles only for the user's selected zone + adjacent zones. On first visit after install, download the tile set in the background. ~10 zones × 50 tiles = 500 tiles = ~10MB. Acceptable.
- **Service worker:** Add a tile-specific cache (`TILE_CACHE`) with a size limit (e.g., 50MB). Evict least-recently-used when full.
- **Fallback:** The zone-alert list already serves as the offline fallback when tiles can't load. This stays.

**Open question:** Should tile caching be opt-in (user taps "download offline map") or automatic for the selected zone? Opt-in is simpler and respects storage constraints.

### 1.4 Self-Hosted Routing

**What:** Replace pre-authored 3-point route paths with real turn-by-turn routing.

**Current state:** `evacuationRoutePath` on each zone is a 3-point mock polyline. The `safest-route` action recommends a path that avoids hazardous zones.

**Design:**
- **Engine:** OSRM (Open Source Routing Machine) with the Philippine road network from OSM.
- **Hosting:** Self-hosted on Render (free tier) or a similar service. The PRD says "a self-hosted OSRM instance later extends this to real path-finding."
- **Hazardous zone avoidance:** Model hazardous zones as a routing cost penalty. A route through a "Dangerous" zone gets a higher weight; the router prefers safer paths.
- **Integration:** The `safest-route` server action calls the OSRM API instead of returning the static path. The bearing/distance calculation (haversine) stays client-side.
- **Offline routing:** Not feasible in V1. The pre-authored paths remain as the offline fallback. The app checks connectivity before calling OSRM; if offline, it returns the static path.

**Parked items addressed:**
- `evacuationRoutePath` comment says "Phase 1 only — real routing lands Phase 2+" — this is that landing.

### 1.5 Threshold Alert Engine + Web Push

**What:** Auto-trigger alerts from crowd reports, and deliver alerts via Web Push with retry.

**This is the V1 exit-criteria driver.** The other four sub-projects enable it; this one delivers it.

**Threshold engine:**
- **Trigger rule:** Multiple reports (≥N), different devices, same zone, within a time window (T hours), average depth above threshold. Configurable per zone.
- **Where it runs:** Server-side, as a Postgres function or a scheduled Edge Function. Not client-side — the operator must review before delivery.
- **Flow:** Crowd reports cross threshold → alert created with `source = 'crowd'` → operator reviews → push sent.
- **`set_zone_alert`** already accepts a `p_source` parameter — the engine calls it with `source = 'crowd'`. No schema change needed.
- **Conservative thresholds:** Low-lying zones get lower thresholds. Higher ground gets higher thresholds. Tunable per zone.

**Web Push:**
- **VAPID keys:** Generate and store in Supabase secrets (or Vercel env vars).
- **Subscription:** residents opt in during onboarding. Store subscriptions in `push_subscriptions` table (already exists in schema).
- **Delivery:** Server-side push via `web-push` npm package. One push, retry once after 60 seconds.
- **Service worker:** `push` event handler already exists (`sw.js`). Display the notification, cache the alert.
- **Fallback:** Push fails → SMS fallback (mock in V1, real provider in V2) → device cache (already works) → Share Alert (already works).

**Parked items addressed:**
- Officials can forge alert's previous level; make `set_zone_alert` the only writer — **verify** that `set_zone_alert` is the only path that writes to `alerts`. Check for any direct `INSERT`/`UPDATE` on `alerts` bypassing the function.
- Orphaned community pins have no moderation path — add a cleanup mechanism or operator moderation for pins whose zone is deleted/inactive.

---

## 2. Parked Items from V0

| Item | Where it lands | Notes |
|---|---|---|
| Late reports count toward flood consensus (no time window) | 1.5 (threshold engine) | Define the time window: reports older than T hours don't count toward the threshold. T is configurable per zone. |
| Officials can forge alert's previous level | 1.5 (verify `set_zone_alert` is sole writer) | Audit all writes to `alerts` table. If any bypass the function, route them through it. |
| Orphaned community pins | 1.1 or 1.5 | Pins whose zone no longer exists need moderation. Either auto-remove or surface to operators. |
| Crash log can be flooded to 300/hour cap | 1.2 or separate fix | Server-side rate limiting on `report_app_error`. Simple fix, can ship anytime. |
| Unowned first write on shared phone | Accepted | No action needed. Documented in PRD Risks. |
| V1 hazard data will be mostly "unknown" | 1.2 | Designed for this. The `unknown` handling in `hazardsForZone` is correct. |

---

## 3. Implementation Order

```
1.1 Nationwide barangay list
  ↓ (zones exist, now need real data per zone)
1.2 Real PAGASA and hazard data
  ↓ (weather data flows, risk engine can score)
1.3 Offline map tiles
  ↓ (map works offline for selected zone)
1.4 Self-hosted routing
  ↓ (real routes, avoiding hazardous zones)
1.5 Threshold alert engine + Web Push
  ↓ (exit criteria met)
```

Each sub-project is a branch. Each ships independently (the app degrades gracefully as each lands). The exit criteria require all five.

---

## 4. Risks

- **PSGc data quality:** The PSA's published list may have duplicate codes, missing coordinates, or name inconsistencies. The seed script needs validation.
- **PAGASA API access:** Unknown timeline. If delayed, V1 ships with real hazard data but mock weather — the risk engine scores on hazard baseline + crowd reports only.
- **42k zones × full fetch:** May be slow on first load. Mitigate with progressive loading (show detected barangay immediately, load rest in background).
- **Tile storage:** Mobile devices have limited storage. Per-zone caching with LRU eviction is essential.
- **OSRM hosting:** Free tier may not sustain production traffic. Monitor and scale.
- **Web Push adoption:** Users must opt in. Low opt-in = low delivery. The install prompt and Share Alert are the fallbacks.
