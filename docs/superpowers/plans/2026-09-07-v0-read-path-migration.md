# v0 Read-Path Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every read of zones, evacuation centres, points of interest, hazard ratings and alerts off hardcoded mock data and onto the Postgres database, while keeping the app fully usable offline.

**Architecture:** Two public route handlers serve the database as JSON in exactly the shapes the app's existing types already use. A client provider fetches them once, gates rendering until they arrive, and exposes them through hooks that return synchronously afterwards — so the ~23 consuming files change one import line each rather than growing loading states. The service worker already caches `/api/zones` stale-while-revalidate and `/api/alerts` network-first; those branches were written for handlers that never existed, and this plan builds them.

**Tech Stack:** Next.js 16 App Router (route handlers are **not** cached by default in this version — verified in `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, so no `force-dynamic` is needed), `@supabase/supabase-js`, Supabase project `keoxneujsebuedqbmqxz` at `https://keoxneujsebuedqbmqxz.supabase.co`.

**Spec:** [docs/superpowers/specs/2026-09-05-v0-supabase-data-layer-design.md](../specs/2026-09-05-v0-supabase-data-layer-design.md)

**Predecessor:** [2026-09-05-v0-database-foundation.md](2026-09-05-v0-database-foundation.md) — ten tables, RLS, seed, 30 denial assertions. Complete.

---

## Scope: this is plan 2 of 3

**In: reads.** Supabase client, `/api/zones`, `/api/alerts`, the provider and hooks, the consumer switch, the service worker's `/api/` branch.

**Out: writes.** The outbox, anonymous auth, all eight Server Actions, migrating the five localStorage stores, the `zone-overrides.ts` collapse, deleting `device-id.ts`, re-pointing the layer 9 downgrade notice at `superseded_severity`, and CI's database wiring. Those are **Plan 3**.

**Why this split is not arbitrary.** Anonymous sign-ins are still **off** in the Supabase dashboard. Every write path depends on `signInAnonymously()` producing a principal for RLS to key on, so writes cannot be built *or tested* until that toggle is flipped. Reads need nothing: `zones`, `evacuation_centers`, `points_of_interest`, `hazard_susceptibility` and `alerts` all carry `for select to anon, authenticated using (true)`. This plan is unblocked today; Plan 3 is not.

The second reason is safety. Writes still go to `localStorage` throughout this plan, so at no point is the data layer half-torn-out. Every task leaves a working app.

## What stays on mock data, deliberately

`src/lib/mock-data/` holds more than the database does. Only these move:

| Mock export | Becomes |
|---|---|
| `MOCK_ZONES` | `zones` ⋈ `evacuation_centers` |
| `MOCK_POIS` | `points_of_interest` |
| `MOCK_HAZARD_SUSCEPTIBILITY`, `getHazardSusceptibilityForZone` | `hazard_susceptibility` |
| `MOCK_ALERTS`, `getActiveAlertForZone` | `alerts` |

Everything else **stays exactly where it is** and must not be touched: all of `weather.ts` (rainfall, wind, typhoon track, thunderstorm, heat index, drought, `getFriendlyWeatherRead`) because real PAGASA ingestion is deferred; `MOCK_SCENARIOS` because drill content is demo material, not observed data; `MOCK_PREDICTIONS` because the prediction engine is Stage 3; `MOCK_CASCADES` because although `zones.downstream_zone_id` is in the database, the cascade's message and impact hours are not; and `MOCK_WATER_LEVEL_REPORTS` because Plan 1 deliberately seeded no community rows.

## Global Constraints

- **Project:** `keoxneujsebuedqbmqxz`, URL `https://keoxneujsebuedqbmqxz.supabase.co`.
- **Never import the service-role key into anything under `src/`.** Route handlers in this plan read public data with the publishable key only. A service key in a client bundle is a total compromise.
- **The `Zone`, `PointOfInterest`, `AlertRecord`, `HazardType` and `HazardRiskLevel` types in `src/lib/types.ts` do not change.** The API denormalises to fit them. Changing a shared type would ripple through 23 files and defeat the point.
- **Bilingual rule, unchanged:** every user-facing string goes through the localisation layer as `LocalizedText`. New loading and error copy is user-facing.
- **The 250 KB first-load budget stands.** `@supabase/supabase-js` must not reach the client bundle — it is server-only, used inside route handlers. Verify with the build output.
- **Route handlers are not cached by default in Next 16.** Do not add `force-dynamic`; do not add `force-static`.
- **`public.zones` is the seeded source of truth** — 4 zones, 4 centres, 6 POIs, 12 hazard rows. Regenerate with `npm run db:seed:generate` if it drifts; never hand-edit `supabase/seed/seed.sql`.
- **Existing gates must stay green:** `npm run lint`, `npm run typecheck`, `npx vitest run`, `npx knip`, `npm run build`. Baseline is **368 tests across 67 files**.

---

## The one architectural decision, stated plainly

`useSelectedZone()` currently does `const DEFAULT_ZONE: Zone = MOCK_ZONES[0]` — a synchronous constant available at module load. Every page depends on a `Zone` existing before it renders. Once zones come from the network there is a window where none exist.

**Resolution: one gate, not 23 loading states.** `ReferenceDataProvider` wraps the app in `layout.tsx` and renders a loading state — or an offline message — until the data is in hand. Children mount only when it is. `useZones()` therefore never returns an empty array to a consumer, and each of the 23 files changes one import line rather than growing its own spinner.

**The cost, accepted deliberately:** server-side rendering now emits a shell for content pages instead of mock-populated HTML. That is a real regression in first paint, and it is the right trade here — the app is already effectively client-rendered (Leaflet, `localStorage`, live position, `"use client"` throughout), it previously server-rendered *fake* data that the client immediately replaced, and on every repeat visit the service worker serves both the shell and `/api/zones` from cache with no network at all. One data path that works offline beats two that disagree.

**The failure state is not optional.** A device that is offline *and* has never cached `/api/zones` must see the offline message, not an indefinite spinner. Task 3 tests this specifically.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/supabase/server.ts` | Server-only Supabase client factory. Throws a named error when env is missing. |
| `src/lib/supabase/env.ts` | Reads and validates the two env vars. One place to get this wrong. |
| `src/app/api/zones/route.ts` | `GET` → `ReferenceData`: zones ⋈ centres, POIs, hazards. |
| `src/app/api/alerts/route.ts` | `GET` → `AlertRecord[]`: active alerts plus recently superseded. |
| `src/lib/reference-data/types.ts` | `ReferenceData` shape, shared by handler and client. |
| `src/lib/reference-data/provider.tsx` | `ReferenceDataProvider` + the render gate. |
| `src/lib/reference-data/use-reference-data.ts` | `useZones()`, `usePois()`, `useHazardsForZone()`. |
| `src/lib/alerts-store.ts` | `useAlerts()`, `useActiveAlertForZone(zoneId)`. |
| `src/test-utils/render-with-data.tsx` | Test harness wrapping a render in a pre-populated provider. |
| `public/sw.js` | Gains an explicit `/api/` branch ahead of the catch-all. |
| `.env.example` | Documents both variable names. Committed. |
| `.env.local` | Real values. **Gitignored.** |

---

### Task 1: Supabase server client and environment

Nothing renders yet. This task exists so the two route handlers that follow share one validated way to reach the database, and so a missing environment variable fails with a sentence rather than `undefined is not a function`.

**Files:**
- Create: `src/lib/supabase/env.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/env.test.ts`, `.env.example`
- Modify: `.gitignore`, `package.json`

**Interfaces:**
- Consumes: nothing
- Produces: `readSupabaseEnv(source?: Record<string, string | undefined>): { url: string; publishableKey: string }` — throws `Error` on missing/blank values. `createSupabaseServerClient(): SupabaseClient` — used only inside route handlers.

- [ ] **Step 1: Write the failing test**

Create `src/lib/supabase/env.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readSupabaseEnv } from "./env";

/**
 * A missing environment variable in a flood-warning system should fail at the
 * first request with a sentence naming the variable — not surface later as an
 * empty zone list that looks like "no alerts".
 */
describe("readSupabaseEnv", () => {
  const valid = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  };

  it("returns both values when present", () => {
    expect(readSupabaseEnv(valid)).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });

  it("names the missing variable rather than failing vaguely", () => {
    expect(() => readSupabaseEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: undefined })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/
    );
  });

  it("treats a blank string as missing, since that is what an unset .env line produces", () => {
    expect(() =>
      readSupabaseEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "   " })
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("refuses a service-role key, which must never reach a NEXT_PUBLIC_ variable", () => {
    // A NEXT_PUBLIC_ variable is compiled into the browser bundle. A service
    // key there is a total compromise of every RLS policy in the system.
    expect(() =>
      readSupabaseEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_abc123" })
    ).toThrow(/service|secret/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/lib/supabase/env.test.ts
```
Expected: FAIL — cannot resolve `./env`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/supabase/env.ts`:

```ts
/**
 * The two variables the app needs to reach Supabase. Both are NEXT_PUBLIC_,
 * meaning Next compiles them into the browser bundle — which is correct for
 * the publishable key (it is designed to be public and is gated by RLS) and
 * is why the secret-key guard below exists.
 */
export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

function require(source: Record<string, string | undefined>, name: string): string {
  const value = source[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill both values ` +
        `from the Supabase dashboard (Project Settings -> API Keys).`
    );
  }
  return value.trim();
}

export function readSupabaseEnv(
  source: Record<string, string | undefined> = process.env
): SupabaseEnv {
  const url = require(source, "NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = require(source, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  // Supabase's secret keys start `sb_secret_`; legacy ones are JWTs carrying
  // "service_role". Either in a NEXT_PUBLIC_ variable would ship a key that
  // bypasses every RLS policy to every visitor's browser.
  if (publishableKey.startsWith("sb_secret_") || publishableKey.includes("service_role")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds what looks like a secret or service-role key. " +
        "NEXT_PUBLIC_ variables are compiled into the browser bundle; use the publishable key."
    );
  }

  return { url, publishableKey };
}
```

Create `src/lib/supabase/server.ts`:

```ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "./env";

/**
 * Used only inside route handlers. `server-only` makes an accidental import
 * from a client component a build error rather than a bundle-size surprise —
 * the app has a 250 KB first-load budget and supabase-js is not in it.
 *
 * No session is persisted: every read in this plan is public data under
 * `select using (true)`, and there is no authenticated user yet.
 */
export function createSupabaseServerClient(): SupabaseClient {
  const { url, publishableKey } = readSupabaseEnv();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

Create `.env.example`:

```
# Copy to .env.local and fill from the Supabase dashboard: Project Settings -> API Keys.
# Both are safe to expose: the publishable key is gated by Row Level Security.
# NEVER put a secret / service-role key in a NEXT_PUBLIC_ variable.
NEXT_PUBLIC_SUPABASE_URL=https://keoxneujsebuedqbmqxz.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

- [ ] **Step 4: Install the dependency and add the real env file**

```bash
npm install @supabase/supabase-js server-only
```

Create `.env.local` with the real values. Get the publishable key by loading the Supabase MCP tools with ONE ToolSearch call — `select:mcp__supabase__get_publishable_keys,mcp__supabase__get_project_url` — and calling `get_publishable_keys`. **`.env.local` must not be committed.** Confirm `.gitignore` already covers it (Next's default `.gitignore` includes `.env*`); if it does not, add `.env.local` and leave `.env.example` tracked.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/lib/supabase/env.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 6: Prove the env file is not tracked**

```bash
git status --short
git check-ignore -v .env.local
```
Expected: `.env.local` appears in neither `git status` untracked output nor as a staged file, and `check-ignore` names the rule matching it. **If `.env.local` shows as untracked-but-not-ignored, stop and fix `.gitignore` before continuing.**

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase .env.example .gitignore package.json package-lock.json
git commit -m "feat(api): add a validated server-only Supabase client"
```

---

### Task 2: `/api/zones` — all reference data in one response

One route, not three. The service worker already caches `/api/zones` in an unversioned cache precisely so a device that updates and then loses signal keeps its evacuation instructions; splitting reference data across three URLs would mean three cache entries that can disagree about which zones exist.

**Files:**
- Create: `src/lib/reference-data/types.ts`, `src/app/api/zones/route.ts`, `src/app/api/zones/route.test.ts`

**Interfaces:**
- Consumes: `createSupabaseServerClient()` from Task 1
- Produces: `ReferenceData` — `{ zones: Zone[]; pois: PointOfInterest[]; hazards: Record<string, Record<HazardType, HazardRiskLevel>> }`, and `toReferenceData(rows)` which Task 3's tests reuse

- [ ] **Step 1: Write the failing test**

Create `src/app/api/zones/route.test.ts`. It tests the pure mapper, not the network — the shape is what 23 files depend on:

```ts
import { describe, it, expect } from "vitest";
import { toReferenceData } from "@/lib/reference-data/types";

/**
 * The whole point of this route is that the database's normalised rows come
 * back in exactly the shape the app's existing `Zone` type already uses, so
 * no consumer has to change more than an import. These tests pin that shape.
 */
const ZONE_ROW = {
  id: "zone-1",
  psgc_barangay_code: "0105528012",
  name: "Barangay Nilombot, Mapandan",
  evacuation_route_text: { en: "Head to the barangay road.", fil: "Dumaan sa barangay road." },
  lat: 16.0288,
  lng: 120.4366,
  evacuation_route_path: [[16.0288, 120.4366], [16.0295, 120.436]],
  hotline_number: "09171234567",
  downstream_zone_id: "zone-2",
  evacuation_centers: {
    name: "Nilombot Elementary School",
    lat: 16.0295,
    lng: 120.436,
    capacity: 300,
    status: "space_available",
  },
};

describe("toReferenceData", () => {
  it("flattens the centre onto the zone, matching the app's Zone type", () => {
    const { zones } = toReferenceData([ZONE_ROW], [], []);
    expect(zones[0]).toMatchObject({
      id: "zone-1",
      psgcBarangayCode: "0105528012",
      evacuationCenterName: "Nilombot Elementary School",
      evacuationCenterLat: 16.0295,
      evacuationCenterCapacity: 300,
      centerStatus: "space_available",
      downstreamZoneId: "zone-2",
    });
  });

  it("carries the localised route text through unchanged", () => {
    const { zones } = toReferenceData([ZONE_ROW], [], []);
    expect(zones[0].evacuationRouteText.fil).toBe("Dumaan sa barangay road.");
  });

  it("omits downstreamZoneId rather than setting it null, since the type says optional", () => {
    // `zone-4` has no downstream zone. `null` would break `if (zone.downstreamZoneId)`
    // consumers less obviously than undefined does, so pin it.
    const { zones } = toReferenceData([{ ...ZONE_ROW, downstream_zone_id: null }], [], []);
    expect(zones[0].downstreamZoneId).toBeUndefined();
  });

  it("groups hazard rows by zone then type, the shape getHazardSusceptibilityForZone returned", () => {
    const { hazards } = toReferenceData(
      [ZONE_ROW],
      [],
      [
        { zone_id: "zone-1", hazard_type: "flood", risk_level: "high" },
        { zone_id: "zone-1", hazard_type: "landslide", risk_level: "low" },
      ]
    );
    expect(hazards["zone-1"]).toEqual({ flood: "high", landslide: "low" });
  });

  it("maps points of interest to the camelCase the app uses", () => {
    const { pois } = toReferenceData(
      [ZONE_ROW],
      [{ id: "poi-1", zone_id: "zone-1", category: "health_center", name: "Nilombot Health Center", lat: 16.02, lng: 120.43 }],
      []
    );
    expect(pois[0]).toEqual({
      id: "poi-1",
      zoneId: "zone-1",
      category: "health_center",
      name: "Nilombot Health Center",
      lat: 16.02,
      lng: 120.43,
    });
  });

  it("throws when a zone has no evacuation centre rather than shipping a broken zone", () => {
    // Every zone must have a centre — it is the thing the app tells people to
    // walk to. A zone rendered with an undefined centre name is worse than a
    // loud failure the operator can see.
    expect(() => toReferenceData([{ ...ZONE_ROW, evacuation_centers: null }], [], [])).toThrow(
      /zone-1/
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/app/api/zones/route.test.ts
```
Expected: FAIL — cannot resolve `@/lib/reference-data/types`.

- [ ] **Step 3: Write the shape and mapper**

Create `src/lib/reference-data/types.ts`:

```ts
import type { HazardRiskLevel, HazardType, PointOfInterest, Zone } from "@/lib/types";

/**
 * Everything the app needs before it can render anything, in one response.
 * One request means one service-worker cache entry, which means these three
 * can never disagree about which zones exist.
 */
export interface ReferenceData {
  zones: Zone[];
  pois: PointOfInterest[];
  hazards: Record<string, Record<HazardType, HazardRiskLevel>>;
}

/** Row shapes as Postgres returns them — snake_case, centre nested by the join. */
interface ZoneRow {
  id: string;
  psgc_barangay_code: string;
  name: string;
  evacuation_route_text: Zone["evacuationRouteText"];
  lat: number;
  lng: number;
  evacuation_route_path: Zone["evacuationRoutePath"];
  hotline_number: string;
  downstream_zone_id: string | null;
  evacuation_centers: {
    name: string;
    lat: number;
    lng: number;
    capacity: number;
    status: Zone["centerStatus"];
  } | null;
}

interface PoiRow {
  id: string;
  zone_id: string;
  category: PointOfInterest["category"];
  name: string;
  lat: number;
  lng: number;
}

interface HazardRow {
  zone_id: string;
  hazard_type: HazardType;
  risk_level: HazardRiskLevel;
}

/**
 * Normalised in Postgres, denormalised here. The app's `Zone` type predates
 * the database and 23 files depend on it, so the mapping happens once, on the
 * server, rather than rippling a type change through the whole client.
 */
export function toReferenceData(
  zoneRows: ZoneRow[],
  poiRows: PoiRow[],
  hazardRows: HazardRow[]
): ReferenceData {
  const zones: Zone[] = zoneRows.map((row) => {
    const centre = row.evacuation_centers;
    if (!centre) {
      // A zone with no centre has nowhere to send anyone. Failing loudly here
      // beats rendering "evacuate to undefined".
      throw new Error(
        `Zone ${row.id} has no evacuation centre. The database is inconsistent — ` +
          `every zone requires one row in evacuation_centers.`
      );
    }
    return {
      id: row.id,
      psgcBarangayCode: row.psgc_barangay_code,
      name: row.name,
      evacuationCenterName: centre.name,
      evacuationRouteText: row.evacuation_route_text,
      lat: row.lat,
      lng: row.lng,
      evacuationCenterLat: centre.lat,
      evacuationCenterLng: centre.lng,
      evacuationRoutePath: row.evacuation_route_path,
      hotlineNumber: row.hotline_number,
      centerStatus: centre.status,
      evacuationCenterCapacity: centre.capacity,
      // The type says optional; null would sneak past `if (zone.downstreamZoneId)`
      // less obviously than undefined in code that spreads or serialises it.
      ...(row.downstream_zone_id ? { downstreamZoneId: row.downstream_zone_id } : {}),
    };
  });

  const pois: PointOfInterest[] = poiRows.map((row) => ({
    id: row.id,
    zoneId: row.zone_id,
    category: row.category,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
  }));

  const hazards: ReferenceData["hazards"] = {};
  for (const row of hazardRows) {
    hazards[row.zone_id] ??= {} as Record<HazardType, HazardRiskLevel>;
    hazards[row.zone_id][row.hazard_type] = row.risk_level;
  }

  return { zones, pois, hazards };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/app/api/zones/route.test.ts
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the route handler**

Create `src/app/api/zones/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toReferenceData } from "@/lib/reference-data/types";

/**
 * All reference data in one response. Route handlers are not cached by default
 * in this version of Next, which is what we want: the service worker owns
 * caching for this URL (stale-while-revalidate into an unversioned cache, so a
 * device that updates and then loses signal keeps its evacuation instructions).
 */
export async function GET() {
  const supabase = createSupabaseServerClient();

  const [zonesResult, poisResult, hazardsResult] = await Promise.all([
    supabase
      .from("zones")
      .select(
        "id, psgc_barangay_code, name, evacuation_route_text, lat, lng, " +
          "evacuation_route_path, hotline_number, downstream_zone_id, " +
          "evacuation_centers(name, lat, lng, capacity, status)"
      )
      .order("id"),
    supabase.from("points_of_interest").select("id, zone_id, category, name, lat, lng").order("id"),
    supabase.from("hazard_susceptibility").select("zone_id, hazard_type, risk_level"),
  ]);

  const failure = zonesResult.error ?? poisResult.error ?? hazardsResult.error;
  if (failure) {
    // Never 200 with partial reference data: a zone list missing entries reads
    // as "that barangay is fine" to whoever is looking at it.
    return NextResponse.json({ error: failure.message }, { status: 502 });
  }

  try {
    const data = toReferenceData(zonesResult.data, poisResult.data, hazardsResult.data);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
```

- [ ] **Step 6: Verify against the real database**

```bash
npm run dev
```
In another terminal:
```bash
curl -s http://localhost:3000/api/zones | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('zones',j.zones.length,'pois',j.pois.length,'hazardZones',Object.keys(j.hazards).length);console.log(JSON.stringify(j.zones[0],null,2))})"
```
Expected: `zones 4 pois 6 hazardZones 4`, and the first zone showing camelCase fields including `evacuationCenterName` and `evacuationCenterCapacity`. Stop the dev server afterwards.

- [ ] **Step 7: Commit**

```bash
git add src/lib/reference-data src/app/api/zones
git commit -m "feat(api): serve zones, centres, POIs and hazards from Postgres"
```

---

### Task 3: The provider, the hooks, and the render gate

This is where the "one gate, not 23 loading states" decision becomes code. It is also where the offline failure state gets built — a device with no network and no cache must be told so, not left spinning.

**Files:**
- Create: `src/lib/reference-data/provider.tsx`, `src/lib/reference-data/use-reference-data.ts`, `src/lib/reference-data/provider.test.tsx`, `src/test-utils/render-with-data.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `ReferenceData` and `toReferenceData` from Task 2
- Produces: `<ReferenceDataProvider>`, `useZones(): Zone[]`, `usePois(): PointOfInterest[]`, `useHazardsForZone(zoneId): Record<HazardType, HazardRiskLevel>`, and `renderWithData(ui, overrides?)` for tests

- [ ] **Step 1: Write the failing test**

Create `src/lib/reference-data/provider.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ReferenceDataProvider } from "./provider";
import { useZones } from "./use-reference-data";
import { LanguageProvider } from "@/features/i18n/language-provider";

function ZoneNames() {
  const zones = useZones();
  return <ul>{zones.map((z) => <li key={z.id}>{z.name}</li>)}</ul>;
}

const ONE_ZONE = {
  zones: [{ id: "zone-1", name: "Barangay Nilombot, Mapandan" }],
  pois: [],
  hazards: {},
};

function renderProvider() {
  render(
    <LanguageProvider>
      <ReferenceDataProvider>
        <ZoneNames />
      </ReferenceDataProvider>
    </LanguageProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReferenceDataProvider", () => {
  it("does not render children until the data is in hand", () => {
    // The whole design rests on this: consumers may assume zones exist.
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderProvider();
    expect(screen.queryByText("Barangay Nilombot, Mapandan")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders children once the data arrives", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ONE_ZONE,
    });
    renderProvider();
    expect(await screen.findByText("Barangay Nilombot, Mapandan")).toBeInTheDocument();
  });

  it("tells the resident it cannot reach the data instead of spinning forever", async () => {
    // A device that is offline AND has never cached /api/zones. An indefinite
    // spinner during a flood is the worst possible answer.
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    renderProvider();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toMatch(/offline|connection|reach/i);
  });

  it("treats a non-ok response as a failure, not as empty data", async () => {
    // A 502 that produced an empty zone list would read as "no zones alerting".
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    renderProvider();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("offers a way to retry, since the network may come back", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    renderProvider();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeInTheDocument();
  });
});

describe("useZones outside a provider", () => {
  it("throws a directive error rather than returning an empty array", () => {
    // Silently returning [] is how "no zones" becomes indistinguishable from
    // "no alerts anywhere". Fail at the developer, not at the resident.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ZoneNames />)).toThrow(/ReferenceDataProvider/);
    quiet.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/lib/reference-data/provider.test.tsx
```
Expected: FAIL — cannot resolve `./provider`.

- [ ] **Step 3: Write the provider and hooks**

Create `src/lib/reference-data/provider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";
import type { ReferenceData } from "./types";

export const ReferenceDataContext = createContext<ReferenceData | null>(null);

const LOADING: LocalizedText = { en: "Loading your zone…", fil: "Kinukuha ang iyong zone…" };
const UNREACHABLE: LocalizedText = {
  en: "Can't reach WeatherWell right now. If you have opened the app before, your saved zone and evacuation instructions are still on this device — reconnect once to load them.",
  fil: "Hindi maabot ang WeatherWell ngayon. Kung nabuksan mo na ito dati, nasa device mo pa rin ang iyong zone at panuto sa paglikas — kumonekta muli para ma-load ang mga ito.",
};
const RETRY: LocalizedText = { en: "Try again", fil: "Subukang muli" };

type State =
  | { status: "loading" }
  | { status: "ready"; data: ReferenceData }
  | { status: "failed" };

/**
 * Fetches the reference data once and gates the app on it.
 *
 * Gating rather than letting each consumer handle an empty list is deliberate:
 * ~23 files read zones, and `useSelectedZone()` must return a real Zone before
 * any page can render. One place to wait means one place to get the waiting
 * right, and consumers may assume the data exists.
 *
 * On a repeat visit the service worker answers /api/zones from cache with no
 * network, so this resolves immediately and the gate is invisible.
 */
export function ReferenceDataProvider({ children }: { children: ReactNode }) {
  const { lang } = useLanguage();
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/zones");
      if (!response.ok) {
        // A partial or errored response must not become an empty zone list —
        // "no zones" and "no alerts" look identical to a resident.
        setState({ status: "failed" });
        return;
      }
      setState({ status: "ready", data: (await response.json()) as ReferenceData });
    } catch {
      setState({ status: "failed" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <p role="status" lang={lang} className="p-6 text-center text-sm text-muted-foreground">
        {t(LOADING, lang)}
      </p>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p role="alert" lang={lang} className="max-w-md text-center text-sm">
          {t(UNREACHABLE, lang)}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border-2 border-border px-4 py-2 text-sm font-medium"
        >
          {t(RETRY, lang)}
        </button>
      </div>
    );
  }

  return (
    <ReferenceDataContext.Provider value={state.data}>{children}</ReferenceDataContext.Provider>
  );
}
```

Create `src/lib/reference-data/use-reference-data.ts`:

```ts
"use client";

import { useContext } from "react";
import { ReferenceDataContext } from "./provider";
import type { HazardRiskLevel, HazardType, PointOfInterest, Zone } from "@/lib/types";

function useData() {
  const data = useContext(ReferenceDataContext);
  if (!data) {
    // Returning empty arrays here would make a wiring mistake look like a
    // barangay with no zones and no alerts. Fail at the developer instead.
    throw new Error(
      "Reference data hooks require a <ReferenceDataProvider> ancestor. In tests, use renderWithData()."
    );
  }
  return data;
}

/** Every zone, ordered by id. Synchronous — the provider gates on this existing. */
export function useZones(): Zone[] {
  return useData().zones;
}

export function usePois(): PointOfInterest[] {
  return useData().pois;
}

/** Replaces getHazardSusceptibilityForZone. Returns an empty record for an unknown zone. */
export function useHazardsForZone(zoneId: string): Record<HazardType, HazardRiskLevel> {
  return useData().hazards[zoneId] ?? ({} as Record<HazardType, HazardRiskLevel>);
}
```

- [ ] **Step 4: Write the test harness**

Create `src/test-utils/render-with-data.tsx`. Every test that renders a zone consumer needs this, so it must be trivial to use:

```tsx
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { ReferenceDataContext } from "@/lib/reference-data/provider";
import type { ReferenceData } from "@/lib/reference-data/types";
import { MOCK_ZONES, MOCK_POIS, MOCK_HAZARD_SUSCEPTIBILITY } from "@/lib/mock-data";
import type { LanguageCode } from "@/lib/types";

/**
 * The seeded fixtures, as reference data. `mock-data` remains the single
 * source of truth for demo content — it is what generates the database seed —
 * so tests and the seeded database describe the same four barangays.
 *
 * Provides the context value directly rather than mounting ReferenceDataProvider,
 * so tests never touch fetch and never wait on a gate they are not testing.
 */
export const FIXTURE_REFERENCE_DATA: ReferenceData = {
  zones: MOCK_ZONES,
  pois: MOCK_POIS,
  hazards: MOCK_HAZARD_SUSCEPTIBILITY,
};

export function renderWithData(
  ui: ReactElement,
  options: { data?: Partial<ReferenceData>; lang?: LanguageCode } = {}
): RenderResult {
  const data: ReferenceData = { ...FIXTURE_REFERENCE_DATA, ...options.data };
  return render(
    <TooltipProvider>
      <LanguageProvider initialLang={options.lang}>
        <ReferenceDataContext.Provider value={data}>{ui}</ReferenceDataContext.Provider>
      </LanguageProvider>
    </TooltipProvider>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/lib/reference-data
```
Expected: PASS, 6 tests.

- [ ] **Step 6: Wire the provider into the layout**

In `src/app/layout.tsx`, import `ReferenceDataProvider` from `@/lib/reference-data/provider` and wrap the content. It must sit **inside** `LanguageProvider` (its loading and error copy is localised) and **outside** `{children}` and `<SelectedZoneHotlineButton />` (which reads the selected zone):

```tsx
<LanguageProvider>
  <ServiceWorkerRegistration />
  <header className="flex items-center justify-center gap-4 p-3">
    <span className="font-semibold">WeatherWell</span>
    <LanguageToggle />
  </header>
  <ReferenceDataProvider>
    {children}
    <SelectedZoneHotlineButton />
  </ReferenceDataProvider>
</LanguageProvider>
```

The header stays outside the gate so the app's name and the language toggle are visible while loading — a resident on a slow connection sees something identifiable, and can switch language before the error copy appears.

- [ ] **Step 7: Verify in the browser**

```bash
npm run dev
```
Load `http://localhost:3000`. Expected: the header appears, then the page. Then in DevTools set the network to Offline and hard-reload with the service worker unregistered: expected is the localised "Can't reach WeatherWell right now" message and a working **Try again** button — not a spinner. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/lib/reference-data src/test-utils/render-with-data.tsx src/app/layout.tsx
git commit -m "feat(api): gate the app on reference data with an offline failure state"
```

---

### Task 4: Switch the zone, POI and hazard consumers

The largest diff in the plan and almost entirely mechanical. Nineteen files swap a module-scope import for a hook call; the tests that render them swap `render` for `renderWithData`.

**Files:**
- Modify: `src/features/zones/use-selected-zone.ts` and the 18 other non-test files listed below, plus every test that renders one of them
- Do NOT modify: anything in `src/lib/mock-data/`

**Interfaces:**
- Consumes: `useZones()`, `usePois()`, `useHazardsForZone()`, `renderWithData()` from Task 3
- Produces: an app whose zone/POI/hazard reads all come from the database

- [ ] **Step 1: Establish the baseline**

```bash
npx vitest run 2>&1 | tail -5
```

**Record the number this prints.** It is 368 plus whatever Tasks 1–3 added (16 at the time of writing, so expect ~384) — but take the actual figure, not the estimate. This task converts tests to a new harness; it must neither add nor remove coverage, so the number you record here is the number you must return to in Step 6.

- [ ] **Step 2: Convert `useSelectedZone` first**

Every page depends on it, so it sets the pattern. Replace the module-scope `MOCK_ZONES` in `src/features/zones/use-selected-zone.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";
import { getSelectedZoneId } from "@/features/onboarding/onboarding-storage";
import { useZones } from "@/lib/reference-data/use-reference-data";
import type { Zone } from "@/lib/types";

function subscribe(): () => void {
  return () => {};
}

function getServerSnapshot(): string | null {
  return null;
}

/**
 * Reads the zone the user chose during onboarding, resolved against the zones
 * the database actually has.
 *
 * The default is now the first zone of the loaded set rather than a mock
 * constant. ReferenceDataProvider guarantees at least the fetch succeeded; a
 * database with zero zones is a real failure and throwing beats returning
 * undefined into every page's `zone.name`.
 */
export function useSelectedZone(): Zone {
  const zones = useZones();
  const zoneId = useSyncExternalStore(subscribe, getSelectedZoneId, getServerSnapshot);

  if (zones.length === 0) {
    throw new Error("No zones available. The database returned an empty zone list.");
  }
  return zones.find((zone) => zone.id === zoneId) ?? zones[0];
}
```

- [ ] **Step 3: Run the tests and expect breakage**

```bash
npx vitest run 2>&1 | tail -20
```
Expected: FAIL — several suites throw "Reference data hooks require a `<ReferenceDataProvider>` ancestor". That error message is the point: it names every test that needs the new harness.

- [ ] **Step 4: Convert the remaining eighteen files**

In each, delete the `@/lib/mock-data` import **only for** `MOCK_ZONES`, `MOCK_POIS`, `MOCK_HAZARD_SUSCEPTIBILITY` and `getHazardSusceptibilityForZone`, and call the hook instead. **Leave every other mock-data import in place** — `getRainfallForZone`, `MOCK_TYPHOON`, `getFriendlyWeatherRead`, `MOCK_SCENARIOS`, `MOCK_CASCADES`, `MOCK_PREDICTIONS`, `MOCK_WATER_LEVEL_REPORTS`, `getHeatIndexForZone` and the rest all stay.

Files taking `useZones()`:
`src/app/admin/map/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/simulation/page.tsx`, `src/app/admin/zone/[zoneId]/page.tsx`, `src/app/map/page.tsx`, `src/app/onboarding/page.tsx`, `src/app/page.tsx`, `src/app/report/page.tsx`, `src/features/admin/admin-map-canvas.tsx`, `src/features/admin/alert-analytics-panel.tsx`, `src/features/admin/flood-monitoring-panel.tsx`, `src/features/admin/report-trend-panel.tsx`, `src/features/homepage-map/personal-status-headline.tsx`, `src/features/zones/zone-map.tsx`

Files taking `usePois()`: `src/features/map/poi-marker-layer.tsx`

Files taking `useHazardsForZone(zoneId)`: `src/features/map/hazard-backdrop-layer.tsx`, `src/features/admin/landslide-risk-panel.tsx`

`src/features/admin/rainfall-monitoring-panel.tsx` and `src/features/admin/typhoon-tracking-panel.tsx` use `MOCK_ZONES` **and** weather functions — convert only the zones import.

**Rules of Hooks:** call `useZones()` once at the top of a component, never inside a `.map()`. Where a file currently reads `MOCK_ZONES` at module scope to build a constant, move that derivation inside the component.

- [ ] **Step 5: Convert the affected tests**

For each failing suite, replace `render(<X />)` with `renderWithData(<X />)` from `@/test-utils/render-with-data`, and `render(<LanguageProvider initialLang="fil">...)` with `renderWithData(<X />, { lang: "fil" })`.

Do **not** weaken any assertion to make a test pass. `src/test-utils/mock-fixtures.ts` keeps working unchanged — it reads `MOCK_ZONES` directly to describe the shipped fixtures, which is exactly what `FIXTURE_REFERENCE_DATA` provides to the components.

- [ ] **Step 6: Return to the baseline**

```bash
npx vitest run 2>&1 | tail -5
```
Expected: **exactly the number you recorded in Step 1.** This task adds no tests and must remove none. A lower number means a suite was deleted rather than converted; a higher number means scope crept in. Both are failures of this task, not adjustments to make.

- [ ] **Step 7: Verify no consumer still imports zones from mock data**

```bash
grep -rn "MOCK_ZONES\|MOCK_POIS\|MOCK_HAZARD_SUSCEPTIBILITY\|getHazardSusceptibilityForZone" src --include=*.ts --include=*.tsx | grep -v "src/lib/mock-data/" | grep -v "src/test-utils/" | grep -v "scripts/"
```
Expected: no output. Matches inside `src/lib/mock-data/` itself, `src/test-utils/` (the fixtures and the harness) and `scripts/` (the seed generator) are correct and expected.

- [ ] **Step 8: Run all gates and commit**

```bash
npm run lint && npm run typecheck && npx knip && npm run build
git add -A src
git commit -m "refactor: read zones, POIs and hazards from the database"
```

---

### Task 5: `/api/alerts` and the alert store

Alerts are the one thing that must never be stale when a network exists, which is why the service worker fetches them network-first with no timeout. This task builds the handler that branch was written for.

**Files:**
- Create: `src/app/api/alerts/route.ts`, `src/lib/alerts-store.ts`, `src/lib/alerts-store.test.tsx`
- Modify: `src/lib/zone-overrides.ts`, and the files calling `getActiveAlertForZone`

**Interfaces:**
- Consumes: `createSupabaseServerClient()`, `ReferenceDataContext`
- Produces: `useAlerts(): AlertRecord[]`, `useActiveAlertForZone(zoneId: string): AlertRecord | undefined`

- [ ] **Step 1: Write the failing test**

Create `src/lib/alerts-store.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { toAlertRecords } from "./alerts-store";

const ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  zone_id: "zone-1",
  severity: "red",
  message: { en: "Knee-deep flooding reported.", fil: "May baha hanggang tuhod." },
  source: "manual",
  confidence: "validated",
  predicted_timing: null,
  issued_at: "2026-09-07T02:00:00.000Z",
  is_active: true,
  superseded_severity: null,
};

describe("toAlertRecords", () => {
  it("maps a row to the AlertRecord shape the app already renders", () => {
    expect(toAlertRecords([ROW])[0]).toEqual({
      id: ROW.id,
      zoneId: "zone-1",
      severity: "red",
      message: ROW.message,
      source: "manual",
      confidence: "validated",
      predictedTiming: undefined,
      issuedAt: ROW.issued_at,
      isActive: true,
    });
  });

  it("carries predicted timing through when present", () => {
    const timing = { en: "within 3 hours", fil: "sa loob ng 3 oras" };
    expect(toAlertRecords([{ ...ROW, predicted_timing: timing }])[0].predictedTiming).toEqual(timing);
  });

  it("keeps superseded rows out of the active set", () => {
    // The response carries recently superseded alerts so a later plan can show
    // "Alert lifted". They must never render as live alerts.
    const records = toAlertRecords([{ ...ROW, is_active: false }]);
    expect(records[0].isActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/lib/alerts-store.test.tsx
```
Expected: FAIL — cannot resolve `./alerts-store`.

- [ ] **Step 3: Write the store**

Create `src/lib/alerts-store.ts`:

```ts
"use client";

import { createContext, useContext } from "react";
import type { AlertRecord } from "./types";

export const AlertsContext = createContext<AlertRecord[] | null>(null);

interface AlertRow {
  id: string;
  zone_id: string;
  severity: AlertRecord["severity"];
  message: AlertRecord["message"];
  source: AlertRecord["source"];
  confidence: AlertRecord["confidence"];
  predicted_timing: AlertRecord["predictedTiming"] | null;
  issued_at: string;
  is_active: boolean;
  superseded_severity: AlertRecord["severity"] | null;
}

export function toAlertRecords(rows: AlertRow[]): AlertRecord[] {
  return rows.map((row) => ({
    id: row.id,
    zoneId: row.zone_id,
    severity: row.severity,
    message: row.message,
    source: row.source,
    confidence: row.confidence,
    predictedTiming: row.predicted_timing ?? undefined,
    issuedAt: row.issued_at,
    isActive: row.is_active,
  }));
}

/** Every alert the response carried, active and recently superseded alike. */
export function useAlerts(): AlertRecord[] {
  const alerts = useContext(AlertsContext);
  if (!alerts) {
    throw new Error("useAlerts requires an <AlertsProvider> ancestor. In tests, use renderWithData().");
  }
  return alerts;
}

/**
 * Replaces getActiveAlertForZone. The database enforces at most one active
 * alert per zone (partial unique index alerts_one_active_per_zone), so this
 * cannot silently pick between two.
 */
export function useActiveAlertForZone(zoneId: string): AlertRecord | undefined {
  return useAlerts().find((alert) => alert.zoneId === zoneId && alert.isActive);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/alerts-store.test.tsx
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the route handler**

Create `src/app/api/alerts/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toAlertRecords } from "@/lib/alerts-store";

/**
 * Active alerts, plus alerts superseded within the downgrade window, so a
 * later plan can tell residents an alert was lifted rather than letting it
 * vanish. Six hours: long enough to cover someone who slept through the
 * change, short enough that it still reads as news.
 */
const DOWNGRADE_WINDOW_HOURS = 6;

export async function GET() {
  const supabase = createSupabaseServerClient();
  const since = new Date(Date.now() - DOWNGRADE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("alerts")
    .select(
      "id, zone_id, severity, message, source, confidence, predicted_timing, issued_at, is_active, superseded_severity"
    )
    .or(`is_active.eq.true,superseded_at.gte.${since}`)
    .order("issued_at", { ascending: false });

  if (error) {
    // Never 200 with an empty list on failure — "no alerts" is the single most
    // dangerous wrong answer this system can give.
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json(toAlertRecords(data));
}
```

- [ ] **Step 6: Provide alerts alongside reference data**

In `src/lib/reference-data/provider.tsx`, fetch `/api/alerts` in the same `load()` as `/api/zones` using `Promise.all`, and wrap children in `<AlertsContext.Provider value={alerts}>` inside the existing `ReferenceDataContext.Provider`. Both must succeed for the gate to open — a page rendering zones with no alerts would show every barangay as safe.

In `src/test-utils/render-with-data.tsx`, add an `alerts` option defaulting to `MOCK_ALERTS`, and wrap the children in `AlertsContext.Provider` too, so existing tests keep the alerts they already assert on.

- [ ] **Step 7: Switch the `getActiveAlertForZone` consumers**

`src/lib/zone-overrides.ts`'s `resolveEffectiveAlert` and `resolveAlertDowngrade` currently call `getActiveAlertForZone(zoneId)` directly. Both are pure functions used inside loops, so they must not call hooks. Change both to take the base alert as a parameter:

```ts
export function resolveEffectiveAlert(
  zoneId: string,
  override: AlertOverrideValue | undefined,
  base: AlertRecord | undefined
): AlertRecord | undefined
```

and likewise `resolveAlertDowngrade(zoneId, override, base)`. Each caller obtains `base` from `useActiveAlertForZone(zoneId)` — or, where it is looping over zones, from a single `useAlerts()` call at the top of the component.

Update `src/lib/zone-overrides.test.ts` to pass the base alert explicitly rather than relying on the mock module.

**The layer 9 regression tests in `src/features/homepage-map/personal-status-headline.test.tsx` must keep passing without being weakened.** They prove a cleared alert still announces itself; that behaviour is not changing here, only where the alert comes from.

- [ ] **Step 8: Verify against the real database**

```bash
npm run dev
```
```bash
curl -s http://localhost:3000/api/alerts | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('alerts',j.length,j.map(a=>a.zoneId+':'+a.severity).join(' '))})"
```
Expected: `alerts 0` — Plan 1 seeded no alerts. That is correct, and it is exactly why the app must render "Safe" for every zone rather than crashing. Load `http://localhost:3000` and confirm it does. Stop the dev server.

- [ ] **Step 9: Run all gates and commit**

```bash
npx vitest run && npm run lint && npm run typecheck && npx knip && npm run build
git add -A src
git commit -m "feat(api): read alerts from the database"
```

Expected: the count from Task 4 Step 6, plus this task's 3 new tests.

---

### Task 6: Service worker routing for the API

`public/sw.js` special-cases `/api/alerts` and `/api/zones` and lets everything else same-origin fall through to stale-while-revalidate in the **asset** cache. That fallthrough is now reachable, and Plan 3 adds a route where it would be a privacy leak. Close it now, while the surface is small.

**Files:**
- Modify: `public/sw.js`, `src/lib/service-worker.test.ts`

**Interfaces:**
- Consumes: `/api/zones` and `/api/alerts` from Tasks 2 and 5
- Produces: an explicit `/api/` branch, and `API_CACHE` for community data in Plan 3

- [ ] **Step 1: Write the failing test**

Append to `src/lib/service-worker.test.ts`, following the file's existing sandbox pattern:

```ts
it("never puts an API response in the asset cache", async () => {
  // The catch-all was written when no /api/ route existed. Community data and,
  // in the next plan, per-person check-ins must not land in the shared asset
  // cache just because they missed the two named branches.
  const { caches } = await handleFetch("/api/pins");
  expect(Object.keys(caches)).not.toContain("weatherwell-assets-v3");
});

it("keeps serving zones from the unversioned zone cache", async () => {
  // The one cache deliberately exempt from version bumps, so a device that
  // updates and then loses signal keeps its evacuation instructions.
  const { caches } = await handleFetch("/api/zones");
  expect(Object.keys(caches)).toContain("weatherwell-zones");
});
```

Adapt `handleFetch` to whatever helper the existing file already uses to drive the sandboxed fetch handler; do not invent a second harness.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/lib/service-worker.test.ts
```
Expected: FAIL — `/api/pins` currently lands in `weatherwell-assets-v3`.

- [ ] **Step 3: Add the explicit branch**

In `public/sw.js`, add a versioned API cache beside the existing names:

```js
const API_CACHE = `weatherwell-api-${VERSION}`;
```

and include it in `CURRENT_CACHES`. Then, in the fetch handler, **after** the `/api/alerts` and `/api/zones` branches and **before** the `/_next/static/` branch, add:

```js
  // Everything else under /api/. Named explicitly so no API response can fall
  // through to the asset cache — the next plan adds /api/check-ins, where a
  // shared cache would serve one resident's response to another.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/lib/service-worker.test.ts
```
Expected: PASS. The existing service-worker tests must all still pass — they parse `VERSION` from the source, so adding a cache name does not break them.

- [ ] **Step 5: Verify offline behaviour end to end**

```bash
npm run build && npm run start
```
Load `http://localhost:3000`, let it settle, then in DevTools → Application → Cache Storage confirm `weatherwell-zones` holds `/api/zones`. Set the network to **Offline** and reload: the app must render from cache with no gate and no error. Then in DevTools → Application → Storage, delete only `weatherwell-zones`, stay offline, and reload: expected is the localised "Can't reach WeatherWell right now" message from Task 3 — proving the failure state is reachable and not theoretical. Stop the server.

- [ ] **Step 6: Bump the service worker version**

`VERSION` is currently `"v3"`. Adding a cache changes the worker, so bump it to `"v4"` — `activate` deletes any cache not in `CURRENT_CACHES`, which is what evicts the old build from installed devices.

- [ ] **Step 7: Run all gates and commit**

```bash
npx vitest run && npm run lint && npm run typecheck && npx knip && npm run build
git add public/sw.js src/lib/service-worker.test.ts
git commit -m "fix(sw): route API responses away from the asset cache"
git push origin v0
```

Expected: the count from Task 5, plus this task's 2 new tests.

---

## Self-Review

**Spec coverage.** Of the spec's read-side requirements: the client zone store and route handlers (Tasks 2, 3, 5); the denormalise-in-the-response decision that keeps `Zone` unchanged (Task 2); the `sw.js` `/api/` branch (Task 6); `/api/zones` staying on the unversioned cache (Task 6 Step 5 verifies it). The spec's `/api/pins` and `/api/reports` handlers are **deliberately not built here** — nothing reads them until their stores migrate in Plan 3, and a handler with no consumer is untested surface.

**Deferred to Plan 3, named so the gap is visible:** anonymous auth and `signInAnonymously()`; the outbox and queue-first writes; all eight Server Actions; migrating `communityPins`, `communityPinVotes`, `waterLevelReports`, `evacuationCheckIns` and `zoneOverrides`; `/api/pins`, `/api/reports`, `/api/check-ins` with `no-store` on the last; the `zone-overrides.ts` collapse onto database alerts; deleting `device-id.ts`; re-pointing layer 9 at `superseded_severity`; CI's database wiring; and seeding community demo rows. Plan 3 also inherits the two findings parked at Plan 1's final review — operator scoping is global rather than per-zone, and `profiles.zone_id` is populated by nothing.

**Placeholder scan.** No TBD/TODO. Every code step carries the actual code. Task 4 lists all nineteen files by path rather than saying "and the others".

**Type consistency.** `ReferenceData` is `{zones, pois, hazards}` in Tasks 2, 3 and 5. `toReferenceData(zoneRows, poiRows, hazardRows)` has the same signature in its test and its implementation. `useZones`/`usePois`/`useHazardsForZone` are spelled identically in Tasks 3, 4 and 5. `renderWithData(ui, {data?, lang?, alerts?})` gains `alerts` in Task 5 Step 6 — Task 3 defines it without, which is correct for the order they are built in. `resolveEffectiveAlert` gains a third parameter in Task 5 Step 7; nothing before Task 5 calls the new form.

**Test-count arithmetic.** Task counts are stated *relatively*, not absolutely, because Tasks 1–3 add 16 tests before Task 4 runs and an absolute figure would be wrong by the time anyone read it. Task 4 Step 1 records the real number and Step 6 returns to it. The invariant that matters: **Task 4 must not change the test count at all** — converting a test to a new harness neither adds nor removes coverage.

**Known risk.** Task 4 touches nineteen files and every test that renders them. If a suite proves impossible to convert without weakening an assertion, that is a signal the component is reading zones in a way the hook cannot serve — stop and report it rather than loosening the test.
