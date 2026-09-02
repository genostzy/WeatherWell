# Interactive Homepage Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the alert-card homepage (`src/app/page.tsx`) with the interactive map described in PRD.md Core Feature #11 — live geolocation, a mocked hazard-tile backdrop, zone-status/evacuation/POI markers, a persistent marker legend, a pre-authored safest-route to each zone's evacuation center with a live bearing/distance direction-to-safety indicator, and an offline fallback list view. (This plan predates the PRD's Personal Status Headline and Current Conditions panel additions — see Self-Review for what's covered and what's deferred.)

**Architecture:** Leaflet + react-leaflet render the map client-side only (dynamically imported with `ssr: false`, since Leaflet touches `window`). All map data is pure mock data added to the existing `mock-data.ts`/`types.ts` files. Pure logic (zone status, hazard colors, marker icon factories) lives in plain `.ts` modules with no Leaflet dependency, so it's unit-testable without touching the map at all — only the final `HomepageMap` component composes Leaflet itself, and that component gets a narrow smoke test rather than deep interaction tests, because jsdom has no real layout engine and Leaflet computes pixel geometry from real `getBoundingClientRect()`/`ResizeObserver` values.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, shadcn/ui, `leaflet` + `react-leaflet` (new deps), Vitest + React Testing Library + axe-core.

**Spec:** `PRD.md` (repo root) — Core Features #4, #8, #9; "Homepage Map — Zone Status Legend" table; Architecture's Map/Routing/Hazard-tile bullets.

## Global Constraints

- No zone boundary polygons are ever drawn on the map (PRD Design & UX: "No drawn zone boundaries") — zones are represented by point markers and a soft hazard-tile blob only, never a polygon outline/fill.
- Zone status markers must pair color with a distinct shape (not color alone) — PRD Accessibility #2 and Design & UX "Zone status is never color-only".
- All user-facing text is `LocalizedText` routed through `t()` — no bare strings, matching every existing feature file.
- The hazard-tile backdrop and zone-status markers must be visually distinguishable from each other (PRD: "one is a tile fill and the other is a point marker") — implemented here as a low-opacity (20%) soft-fill blob for hazard risk vs. an opaque shaped marker for live status.
- "Safest Route" in Phase 1 goes to each zone's evacuation center only, pre-authored (no real routing engine) — per PRD's Out of Scope and Core Feature #9.
- If a route unavoidably crosses a Dangerous/Hazardous zone, it must still display but be visibly flagged as hazardous, never presented as safe.
- Icons come from `lucide-react` (already the project's icon library) — do not introduce a second icon set.
- Every new component that has no Leaflet dependency gets a real Vitest test. The Leaflet-dependent `HomepageMap` component gets one smoke test; if jsdom's lack of real layout makes even that flaky, document the limitation the same way `accessibility.test.tsx` already documents the jsdom `color-contrast` gap — do not silently skip without a comment.
- Run `npm run lint`, `npm test -- --run`, and `npm run build` before any task is considered done.

---

### Task 1: Map dependencies and mock data model

**Files:**
- Modify: `package.json`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/mock-data.ts`
- Test: `src/lib/mock-data.test.ts` (new)

**Interfaces:**
- Produces: `Zone.lat`, `Zone.lng`, `Zone.evacuationCenterLat`, `Zone.evacuationCenterLng`, `Zone.evacuationRoutePath: [number, number][]`; `POICategory`, `PointOfInterest`; `HazardType`, `HazardRiskLevel`; `MOCK_POIS`, `MOCK_HAZARD_SUSCEPTIBILITY`, `getPOIsForZone(zoneId): PointOfInterest[]`, `getHazardSusceptibilityForZone(zoneId): Record<HazardType, HazardRiskLevel>`.

- [ ] **Step 1: Install the map libraries**

Run:
```bash
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

Verify peer-dependency compatibility with React 19 / Next 16:
```bash
npm ls react-leaflet leaflet
```
If npm reports an unresolved peer-dependency conflict, stop and escalate rather than forcing an install flag — do not guess at `--legacy-peer-deps` without checking what's actually incompatible first.

- [ ] **Step 2: Write the failing data-shape test**

Create `src/lib/mock-data.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  MOCK_ZONES,
  MOCK_POIS,
  MOCK_HAZARD_SUSCEPTIBILITY,
  getPOIsForZone,
  getHazardSusceptibilityForZone,
} from "./mock-data";

describe("map mock data", () => {
  it("gives every zone real coordinates for the homepage map", () => {
    for (const zone of MOCK_ZONES) {
      expect(typeof zone.lat).toBe("number");
      expect(typeof zone.lng).toBe("number");
      expect(typeof zone.evacuationCenterLat).toBe("number");
      expect(typeof zone.evacuationCenterLng).toBe("number");
      expect(zone.evacuationRoutePath.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("covers all five essential-service categories across the mock POIs", () => {
    const categories = new Set(MOCK_POIS.map((poi) => poi.category));
    expect(categories).toEqual(
      new Set(["health_center", "pharmacy", "market", "water_station", "barangay_office"])
    );
  });

  it("returns only the POIs belonging to the requested zone", () => {
    const zone1Pois = getPOIsForZone("zone-1");
    expect(zone1Pois.length).toBeGreaterThan(0);
    expect(zone1Pois.every((poi) => poi.zoneId === "zone-1")).toBe(true);
  });

  it("gives every zone a risk level for all three hazard types", () => {
    for (const zone of MOCK_ZONES) {
      const risk = getHazardSusceptibilityForZone(zone.id);
      expect(risk.flood).toBeDefined();
      expect(risk.landslide).toBeDefined();
      expect(risk.storm_surge).toBeDefined();
    }
  });

  it("has an entry in MOCK_HAZARD_SUSCEPTIBILITY for every zone", () => {
    for (const zone of MOCK_ZONES) {
      expect(MOCK_HAZARD_SUSCEPTIBILITY[zone.id]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2b: Run it to verify it fails**

Run: `npm test -- --run mock-data.test.ts`
Expected: FAIL — `Zone.lat` etc. don't exist yet, `MOCK_POIS`/`getPOIsForZone`/etc. aren't exported.

- [ ] **Step 3: Extend the type model**

In `src/lib/types.ts`, add to the `Zone` interface (after `evacuationRouteText`, before `hotlineNumber`):
```typescript
  lat: number;
  lng: number;
  evacuationCenterLat: number;
  evacuationCenterLng: number;
  /** Pre-authored path from the zone's own point to its evacuation center. Phase 1 only — real routing lands Phase 2+. */
  evacuationRoutePath: [number, number][];
```

Append new types at the end of the file:
```typescript
export type POICategory =
  | "health_center"
  | "pharmacy"
  | "market"
  | "water_station"
  | "barangay_office";

export interface PointOfInterest {
  id: string;
  zoneId: string;
  category: POICategory;
  name: string;
  lat: number;
  lng: number;
}

export type HazardType = "flood" | "landslide" | "storm_surge";
export type HazardRiskLevel = "low" | "medium" | "high";
```

- [ ] **Step 4: Extend the mock data**

In `src/lib/mock-data.ts`, add `lat`/`lng`/`evacuationCenterLat`/`evacuationCenterLng`/`evacuationRoutePath` to each of the 3 entries in `MOCK_ZONES`:

```typescript
// zone-1 (San Isidro) — add inside the existing object, alongside evacuationRouteText:
    lat: 14.656,
    lng: 121.1015,
    evacuationCenterLat: 14.657,
    evacuationCenterLng: 121.1005,
    evacuationRoutePath: [
      [14.656, 121.1015],
      [14.6565, 121.101],
      [14.657, 121.1005],
    ],

// zone-2 (Malinis):
    lat: 14.648,
    lng: 121.105,
    evacuationCenterLat: 14.647,
    evacuationCenterLng: 121.106,
    evacuationRoutePath: [
      [14.648, 121.105],
      [14.6475, 121.1055],
      [14.647, 121.106],
    ],

// zone-3 (Bagong Silang):
    lat: 14.658,
    lng: 121.112,
    evacuationCenterLat: 14.659,
    evacuationCenterLng: 121.113,
    evacuationRoutePath: [
      [14.658, 121.112],
      [14.6585, 121.1125],
      [14.659, 121.113],
    ],
```

Append after `MOCK_SCENARIOS` (before the `getActiveAlertForZone` function):

```typescript
import type { PointOfInterest, HazardType, HazardRiskLevel } from "./types";

export const MOCK_POIS: PointOfInterest[] = [
  {
    id: "poi-1",
    zoneId: "zone-1",
    category: "health_center",
    name: "San Isidro Health Center",
    lat: 14.6555,
    lng: 121.102,
  },
  {
    id: "poi-2",
    zoneId: "zone-1",
    category: "market",
    name: "San Isidro Public Market",
    lat: 14.6565,
    lng: 121.101,
  },
  {
    id: "poi-3",
    zoneId: "zone-2",
    category: "pharmacy",
    name: "Malinis Botika",
    lat: 14.6485,
    lng: 121.1045,
  },
  {
    id: "poi-4",
    zoneId: "zone-2",
    category: "water_station",
    name: "Malinis Water Refilling Station",
    lat: 14.6475,
    lng: 121.1055,
  },
  {
    id: "poi-5",
    zoneId: "zone-3",
    category: "barangay_office",
    name: "Bagong Silang Barangay Hall",
    lat: 14.6575,
    lng: 121.1115,
  },
];

export const MOCK_HAZARD_SUSCEPTIBILITY: Record<string, Record<HazardType, HazardRiskLevel>> = {
  "zone-1": { flood: "high", landslide: "low", storm_surge: "low" },
  "zone-2": { flood: "high", landslide: "low", storm_surge: "medium" },
  "zone-3": { flood: "medium", landslide: "medium", storm_surge: "low" },
};

export function getPOIsForZone(zoneId: string): PointOfInterest[] {
  return MOCK_POIS.filter((poi) => poi.zoneId === zoneId);
}

export function getHazardSusceptibilityForZone(
  zoneId: string
): Record<HazardType, HazardRiskLevel> {
  return MOCK_HAZARD_SUSCEPTIBILITY[zoneId];
}
```

(Move the `import type { PointOfInterest, HazardType, HazardRiskLevel } from "./types";` line up to the top of the file next to the existing `import type { Zone, AlertRecord, PredictionStep, CascadeAlert } from "./types";` line instead of inline — inline imports mid-file are invalid TypeScript; consolidate into one `import type` statement at the top.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- --run mock-data.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Run full verification and commit**

Run: `npm run lint && npm test -- --run && npm run build`
Expected: all green (existing tests must still pass — `Zone` gained required fields, so double check no test constructs a `Zone` object literal by hand instead of importing from `MOCK_ZONES`; if one does, escalate rather than guessing whether to add the new fields there or refactor the test).

```bash
git add package.json package-lock.json src/lib/types.ts src/lib/mock-data.ts src/lib/mock-data.test.ts
git commit -m "feat: add map dependencies, zone coordinates, POI and hazard mock data"
```

---

### Task 2: Zone status module

**Files:**
- Create: `src/lib/zone-status.ts`
- Test: `src/lib/zone-status.test.ts`

**Interfaces:**
- Consumes: `AlertRecord` and `Severity` from existing `types.ts`/`severity.ts`; `SEVERITY_HEX` from `severity.ts`.
- Produces: `ZoneStatus` (`"safe" | "cautionary" | "dangerous" | "hazardous"`), `getZoneStatus(alert: AlertRecord | undefined): ZoneStatus`, `ZONE_STATUS_LABEL: Record<ZoneStatus, LocalizedText>`, `getZoneStatusColor(alert: AlertRecord | undefined): string`, `SAFE_HEX`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/zone-status.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL, SAFE_HEX } from "./zone-status";
import { SEVERITY_HEX } from "./severity";
import type { AlertRecord } from "./types";

function alertWith(severity: AlertRecord["severity"]): AlertRecord {
  return {
    id: "a",
    zoneId: "zone-1",
    severity,
    message: { en: "x", fil: "x" },
    source: "manual",
    confidence: "estimated",
    issuedAt: "2026-01-01T00:00:00.000Z",
    isActive: true,
  };
}

describe("getZoneStatus", () => {
  it("is safe when there is no active alert", () => {
    expect(getZoneStatus(undefined)).toBe("safe");
  });

  it("is cautionary for yellow and orange severities", () => {
    expect(getZoneStatus(alertWith("yellow"))).toBe("cautionary");
    expect(getZoneStatus(alertWith("orange"))).toBe("cautionary");
  });

  it("is dangerous for red", () => {
    expect(getZoneStatus(alertWith("red"))).toBe("dangerous");
  });

  it("is hazardous for evacuate", () => {
    expect(getZoneStatus(alertWith("evacuate"))).toBe("hazardous");
  });
});

describe("getZoneStatusColor", () => {
  it("uses the safe green when there is no alert", () => {
    expect(getZoneStatusColor(undefined)).toBe(SAFE_HEX);
  });

  it("uses the exact severity hex for an active alert — no second color scale", () => {
    expect(getZoneStatusColor(alertWith("red"))).toBe(SEVERITY_HEX.red);
    expect(getZoneStatusColor(alertWith("evacuate"))).toBe(SEVERITY_HEX.evacuate);
  });
});

describe("ZONE_STATUS_LABEL", () => {
  it("has an English and Filipino label for all four statuses", () => {
    for (const status of ["safe", "cautionary", "dangerous", "hazardous"] as const) {
      expect(ZONE_STATUS_LABEL[status].en).toBeTruthy();
      expect(ZONE_STATUS_LABEL[status].fil).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- --run zone-status.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/lib/zone-status.ts`:
```typescript
import { SEVERITY_HEX } from "./severity";
import type { AlertRecord, LocalizedText } from "./types";

export type ZoneStatus = "safe" | "cautionary" | "dangerous" | "hazardous";

/** Green used only for the map's zero-state — not part of the alert severity scale. */
export const SAFE_HEX = "#22c55e";

/**
 * Plain-language map legend from PRD's "Homepage Map — Zone Status Legend".
 * This simplifies the *label* only; the underlying severity color grammar
 * (SEVERITY_HEX) is unchanged — see getZoneStatusColor.
 */
export function getZoneStatus(alert: AlertRecord | undefined): ZoneStatus {
  if (!alert) return "safe";
  switch (alert.severity) {
    case "yellow":
    case "orange":
      return "cautionary";
    case "red":
      return "dangerous";
    case "evacuate":
      return "hazardous";
  }
}

/** Returns the exact severity hex for an active alert, or the safe green for none. */
export function getZoneStatusColor(alert: AlertRecord | undefined): string {
  if (!alert) return SAFE_HEX;
  return SEVERITY_HEX[alert.severity];
}

export const ZONE_STATUS_LABEL: Record<ZoneStatus, LocalizedText> = {
  safe: { en: "Safe", fil: "Ligtas" },
  cautionary: { en: "Cautionary", fil: "Mag-ingat" },
  dangerous: { en: "Dangerous", fil: "Mapanganib" },
  hazardous: { en: "Hazardous", fil: "Lumikas Na" },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run zone-status.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/zone-status.ts src/lib/zone-status.test.ts
git commit -m "feat: add zone status module mapping alerts to the map's plain-language legend"
```

---

### Task 3: Hazard color and marker icon factories

**Files:**
- Create: `src/features/homepage-map/hazard-color.ts`
- Test: `src/features/homepage-map/hazard-color.test.ts`
- Create: `src/features/homepage-map/marker-icons.ts`
- Test: `src/features/homepage-map/marker-icons.test.ts`

**Interfaces:**
- Consumes: `HazardRiskLevel` from `types.ts`; `SEVERITY_HEX` from `severity.ts`; `ZoneStatus` from `zone-status.ts`; `POICategory` from `types.ts`; `leaflet`'s `divIcon`.
- Produces: `hazardRiskColor(level: HazardRiskLevel): string`; `createStatusMarkerIcon(status: ZoneStatus, label: string): L.DivIcon`, `createPoiMarkerIcon(category: POICategory, label: string): L.DivIcon`, `createEvacuationMarkerIcon(label: string): L.DivIcon`.

- [ ] **Step 1: Write the failing hazard-color test**

Create `src/features/homepage-map/hazard-color.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { hazardRiskColor } from "./hazard-color";
import { SEVERITY_HEX } from "@/lib/severity";

describe("hazardRiskColor", () => {
  it("maps low/medium/high onto the existing locked severity hexes", () => {
    expect(hazardRiskColor("low")).toBe(SEVERITY_HEX.yellow);
    expect(hazardRiskColor("medium")).toBe(SEVERITY_HEX.orange);
    expect(hazardRiskColor("high")).toBe(SEVERITY_HEX.red);
  });
});
```

- [ ] **Step 2: Verify it fails, then implement**

Run: `npm test -- --run hazard-color.test.ts` → FAIL (module missing).

Create `src/features/homepage-map/hazard-color.ts`:
```typescript
import { SEVERITY_HEX } from "@/lib/severity";
import type { HazardRiskLevel } from "@/lib/types";

/**
 * Reuses the locked severity hexes for the hazard-tile backdrop instead of
 * inventing a second palette — the backdrop is rendered at low opacity as a
 * soft fill, which is what visually separates it from the opaque zone-status
 * markers that use the same colors at full strength (PRD: "one is a tile
 * fill and the other is a point marker").
 */
export function hazardRiskColor(level: HazardRiskLevel): string {
  switch (level) {
    case "low":
      return SEVERITY_HEX.yellow;
    case "medium":
      return SEVERITY_HEX.orange;
    case "high":
      return SEVERITY_HEX.red;
  }
}
```

Run: `npm test -- --run hazard-color.test.ts` → PASS.

- [ ] **Step 3: Write the failing marker-icon test**

Create `src/features/homepage-map/marker-icons.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  createStatusMarkerIcon,
  createPoiMarkerIcon,
  createEvacuationMarkerIcon,
} from "./marker-icons";

describe("createStatusMarkerIcon", () => {
  it("gives each status a distinct shape class, not color alone", () => {
    const shapes = ["safe", "cautionary", "dangerous", "hazardous"].map(
      (status) => createStatusMarkerIcon(status as never, "label").options.className
    );
    expect(new Set(shapes).size).toBe(4);
  });

  it("bakes an accessible label into the marker HTML", () => {
    const icon = createStatusMarkerIcon("hazardous", "Barangay San Isidro — Hazardous");
    expect(icon.options.html).toContain("Barangay San Isidro — Hazardous");
    expect(icon.options.html).toContain('role="img"');
  });
});

describe("createPoiMarkerIcon", () => {
  it("gives every POI category a distinct icon class", () => {
    const categories = [
      "health_center",
      "pharmacy",
      "market",
      "water_station",
      "barangay_office",
    ] as const;
    const classes = categories.map((c) => createPoiMarkerIcon(c, "label").options.className);
    expect(new Set(classes).size).toBe(categories.length);
  });
});

describe("createEvacuationMarkerIcon", () => {
  it("returns a divIcon with the given label baked in", () => {
    const icon = createEvacuationMarkerIcon("San Isidro Elementary School");
    expect(icon.options.html).toContain("San Isidro Elementary School");
  });
});
```

- [ ] **Step 4: Verify it fails, then implement**

Run: `npm test -- --run marker-icons.test.ts` → FAIL (module missing).

Create `src/features/homepage-map/marker-icons.ts`:
```typescript
import L from "leaflet";
import { getZoneStatusColor } from "@/lib/zone-status";
import type { ZoneStatus } from "@/lib/zone-status";
import type { POICategory } from "@/lib/types";

/**
 * Leaflet's default marker images 404 under bundlers (a well-known gotcha),
 * and we need colorblind-safe shape differentiation anyway, so every marker
 * here is a small inline-styled divIcon instead — CSS shape, not an image.
 */

const STATUS_SHAPE_STYLE: Record<ZoneStatus, string> = {
  safe: "border-radius: 50%;", // circle
  cautionary: "clip-path: polygon(50% 0%, 0% 100%, 100% 100%);", // triangle
  dangerous: "transform: rotate(45deg);", // diamond
  hazardous:
    "clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%);", // octagon
};

const STATUS_COLOR_HEX: Record<ZoneStatus, string> = {
  safe: "#22c55e",
  cautionary: "#f97316",
  dangerous: "#dc2626",
  hazardous: "#7f1d1d",
};

export function createStatusMarkerIcon(status: ZoneStatus, label: string): L.DivIcon {
  const color = STATUS_COLOR_HEX[status];
  const shape = STATUS_SHAPE_STYLE[status];
  return L.divIcon({
    className: `zone-status-marker zone-status-marker--${status}`,
    html: `<div role="img" aria-label="${label}" style="width:22px;height:22px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);${shape}"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

const POI_ICON_GLYPH: Record<POICategory, string> = {
  health_center: "&#10133;", // plus
  pharmacy: "&#128138;", // pill-ish
  market: "&#128715;", // basket-ish
  water_station: "&#128167;", // droplet
  barangay_office: "&#127963;", // building
};

export function createPoiMarkerIcon(category: POICategory, label: string): L.DivIcon {
  return L.divIcon({
    className: `poi-marker poi-marker--${category}`,
    html: `<div role="img" aria-label="${label}" style="width:24px;height:24px;background:#1f2937;border:2px solid white;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;">${POI_ICON_GLYPH[category]}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function createEvacuationMarkerIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: "evacuation-marker",
    html: `<div role="img" aria-label="${label}" style="width:26px;height:26px;background:#0f766e;border:2px solid white;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:13px;">&#127963;</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}
```

Note: swap the placeholder HTML-entity glyphs above for real inline SVG paths from `lucide-react`'s source (Stethoscope, Pill, ShoppingBasket, Droplet, Landmark, Building2) if the reviewer flags the emoji-adjacent entities as inconsistent with the project's "no emoji as icons" convention — entities were used here only to keep this plan's code block short; do not ship them as literal deliverables without checking that call.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- --run marker-icons.test.ts hazard-color.test.ts`
Expected: PASS (5 tests total)

- [ ] **Step 6: Commit**

```bash
git add src/features/homepage-map/hazard-color.ts src/features/homepage-map/hazard-color.test.ts src/features/homepage-map/marker-icons.ts src/features/homepage-map/marker-icons.test.ts
git commit -m "feat: add hazard-tile color mapping and marker icon factories"
```

---

### Task 4: Marker legend component

**Files:**
- Create: `src/features/homepage-map/marker-legend.tsx`
- Test: `src/features/homepage-map/marker-legend.test.tsx`

**Interfaces:**
- Consumes: `useLanguage` from `@/features/i18n/language-provider`; `t` from `@/lib/i18n`; `ZONE_STATUS_LABEL` from `@/lib/zone-status`; `Card`/`CardContent` from `@/components/ui/card`.
- Produces: `<MarkerLegend />` — no props, self-contained.

- [ ] **Step 1: Write the failing test**

Create `src/features/homepage-map/marker-legend.test.tsx`:
```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkerLegend } from "./marker-legend";

describe("MarkerLegend", () => {
  it("explains all four zone status labels", () => {
    render(<MarkerLegend />);
    expect(screen.getByText("Safe")).toBeInTheDocument();
    expect(screen.getByText("Cautionary")).toBeInTheDocument();
    expect(screen.getByText("Dangerous")).toBeInTheDocument();
    expect(screen.getByText("Hazardous")).toBeInTheDocument();
  });

  it("explains the evacuation and essential-service marker types", () => {
    render(<MarkerLegend />);
    expect(screen.getByText(/evacuation center/i)).toBeInTheDocument();
    expect(screen.getByText(/health center/i)).toBeInTheDocument();
    expect(screen.getByText(/pharmacy/i)).toBeInTheDocument();
    expect(screen.getByText(/market/i)).toBeInTheDocument();
    expect(screen.getByText(/water/i)).toBeInTheDocument();
    expect(screen.getByText(/barangay office/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verify it fails, then implement**

Run: `npm test -- --run marker-legend.test.tsx` → FAIL (module missing).

Create `src/features/homepage-map/marker-legend.tsx`:
```typescript
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { ZONE_STATUS_LABEL, type ZoneStatus } from "@/lib/zone-status";
import type { LocalizedText } from "@/lib/types";

const ZONE_STATUS_ORDER: ZoneStatus[] = ["safe", "cautionary", "dangerous", "hazardous"];

const STATUS_SWATCH_CLASS: Record<ZoneStatus, string> = {
  safe: "rounded-full bg-green-500",
  cautionary: "bg-severity-orange",
  dangerous: "rotate-45 bg-severity-red",
  hazardous: "bg-severity-evacuate",
};

const MARKER_LEGEND_ITEMS: { key: string; label: LocalizedText }[] = [
  { key: "evacuation", label: { en: "Evacuation center", fil: "Evacuation center" } },
  { key: "health_center", label: { en: "Health center", fil: "Health center" } },
  { key: "pharmacy", label: { en: "Pharmacy", fil: "Botika" } },
  { key: "market", label: { en: "Market", fil: "Palengke" } },
  { key: "water_station", label: { en: "Water refilling station", fil: "Water station" } },
  { key: "barangay_office", label: { en: "Barangay office", fil: "Barangay office" } },
];

const LEGEND_TITLE: LocalizedText = { en: "Map legend", fil: "Legend ng Mapa" };

export function MarkerLegend() {
  const { lang } = useLanguage();

  return (
    <Card className="w-full max-w-md">
      <CardContent className="space-y-3 pt-6">
        <p className="text-sm font-semibold">{t(LEGEND_TITLE, lang)}</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {ZONE_STATUS_ORDER.map((status) => (
            <div key={status} className="flex items-center gap-2">
              <span className={`h-3 w-3 shrink-0 ${STATUS_SWATCH_CLASS[status]}`} aria-hidden="true" />
              <span>{t(ZONE_STATUS_LABEL[status], lang)}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
          {MARKER_LEGEND_ITEMS.map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-sm bg-foreground/60" aria-hidden="true" />
              <span>{t(item.label, lang)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npm test -- --run marker-legend.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add src/features/homepage-map/marker-legend.tsx src/features/homepage-map/marker-legend.test.tsx
git commit -m "feat: add persistent map marker legend"
```

---

### Task 5: Hazard type selector

**Files:**
- Create: `src/features/homepage-map/hazard-type-selector.tsx`
- Test: `src/features/homepage-map/hazard-type-selector.test.tsx`

**Design decision (not in PRD verbatim — resolving an ambiguity):** PRD Core Feature #8 describes the hazard-tile backdrop as showing "Flood/Landslide/Storm Surge risk" without specifying whether all three render at once or one at a time. Rendering three overlapping colored fills at once on the same points is visually unreadable. This task adds a 3-way segmented control (Flood / Landslide / Storm Surge) that switches which hazard type the backdrop displays, defaulting to Flood since the rest of the app (predictions, depth reports, alerts) is flood-specific. Flag this decision to the user in the final report — it is a reasonable reading of the PRD, not a literal instruction.

**Interfaces:**
- Produces: `<HazardTypeSelector value={hazardType} onChange={(t: HazardType) => void} />`.

- [ ] **Step 1: Write the failing test**

Create `src/features/homepage-map/hazard-type-selector.test.tsx`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HazardTypeSelector } from "./hazard-type-selector";

describe("HazardTypeSelector", () => {
  it("shows all three hazard types with Flood selected", () => {
    render(<HazardTypeSelector value="flood" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: /flood/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("radio", { name: /landslide/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /storm surge/i })).toBeInTheDocument();
  });

  it("calls onChange with the clicked hazard type", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<HazardTypeSelector value="flood" onChange={onChange} />);
    await user.click(screen.getByRole("radio", { name: /landslide/i }));
    expect(onChange).toHaveBeenCalledWith("landslide");
  });
});
```

- [ ] **Step 2: Verify it fails, then implement**

Run: `npm test -- --run hazard-type-selector.test.tsx` → FAIL (module missing).

Create `src/features/homepage-map/hazard-type-selector.tsx`:
```typescript
"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { HazardType, LocalizedText } from "@/lib/types";

const HAZARD_TYPE_LABEL: Record<HazardType, LocalizedText> = {
  flood: { en: "Flood", fil: "Baha" },
  landslide: { en: "Landslide", fil: "Guho" },
  storm_surge: { en: "Storm Surge", fil: "Storm Surge" },
};

const HAZARD_TYPE_ORDER: HazardType[] = ["flood", "landslide", "storm_surge"];

export function HazardTypeSelector({
  value,
  onChange,
}: {
  value: HazardType;
  onChange: (type: HazardType) => void;
}) {
  const { lang } = useLanguage();

  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as HazardType)}
      className="flex gap-4"
    >
      {HAZARD_TYPE_ORDER.map((type) => (
        <div key={type} className="flex items-center gap-2">
          <RadioGroupItem value={type} id={`hazard-type-${type}`} />
          <Label htmlFor={`hazard-type-${type}`}>{t(HAZARD_TYPE_LABEL[type], lang)}</Label>
        </div>
      ))}
    </RadioGroup>
  );
}
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npm test -- --run hazard-type-selector.test.tsx`
Expected: PASS (2 tests) — Radix `RadioGroupItem` exposes `role="radio"` with `aria-checked`, matching the assertions above.

- [ ] **Step 4: Commit**

```bash
git add src/features/homepage-map/hazard-type-selector.tsx src/features/homepage-map/hazard-type-selector.test.tsx
git commit -m "feat: add hazard type selector for the map backdrop"
```

---

### Task 6: Offline fallback list view and tile-cache detection hook

**Files:**
- Create: `src/features/homepage-map/use-tiles-cached.ts`
- Test: `src/features/homepage-map/use-tiles-cached.test.ts`
- Create: `src/features/homepage-map/zone-alert-list-fallback.tsx`
- Test: `src/features/homepage-map/zone-alert-list-fallback.test.tsx`

**Interfaces:**
- Produces: `useIsOnline(): boolean` (Phase 1 proxy for "tiles are cached" — real tile-cache detection needs the Phase 2 service worker; `navigator.onLine` is the closest signal available with no backend); `<ZoneAlertListFallback zones={Zone[]} />`.

- [ ] **Step 1: Write the failing hook test**

Create `src/features/homepage-map/use-tiles-cached.test.ts`:
```typescript
import { describe, it, expect, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useIsOnline } from "./use-tiles-cached";

describe("useIsOnline", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("reflects navigator.onLine", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(false);
  });

  it("is true when online", () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Verify it fails, then implement**

Run: `npm test -- --run use-tiles-cached.test.ts` → FAIL (module missing).

Create `src/features/homepage-map/use-tiles-cached.ts`:
```typescript
"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  return true;
}

/**
 * Phase 1 proxy for "does the map have tiles to show." Real tile-cache
 * detection needs the Phase 2 service worker; navigator.onLine is the
 * closest signal available with no backend, and errs toward showing the
 * map rather than the fallback when the signal is ambiguous.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

- [ ] **Step 3: Run it to verify it passes**

Run: `npm test -- --run use-tiles-cached.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: Write the failing fallback-list test**

Create `src/features/homepage-map/zone-alert-list-fallback.test.tsx`:
```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZoneAlertListFallback } from "./zone-alert-list-fallback";
import { MOCK_ZONES } from "@/lib/mock-data";

describe("ZoneAlertListFallback", () => {
  it("lists every zone by name", () => {
    render(<ZoneAlertListFallback zones={MOCK_ZONES} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("explains that this is a no-map fallback", () => {
    render(<ZoneAlertListFallback zones={MOCK_ZONES} />);
    expect(screen.getByText(/no connection|offline|no internet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Verify it fails, then implement**

Run: `npm test -- --run zone-alert-list-fallback.test.tsx` → FAIL (module missing).

Create `src/features/homepage-map/zone-alert-list-fallback.tsx`:
```typescript
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { SeverityBadge } from "@/features/alerts/severity-badge";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getActiveAlertForZone } from "@/lib/mock-data";
import type { LocalizedText, Zone } from "@/lib/types";

const NO_CONNECTION_NOTE: LocalizedText = {
  en: "No internet connection — showing the last known alert status for each zone instead of the map.",
  fil: "Walang internet connection — ipinapakita ang huling kilalang alert status ng bawat zone sa halip na ang mapa.",
};

const CLEAR_NO_ALERT: LocalizedText = { en: "Clear — no active alert", fil: "Ligtas" };

export function ZoneAlertListFallback({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();

  return (
    <div className="w-full max-w-md space-y-3">
      <p lang={lang} className="text-sm text-muted-foreground">
        {t(NO_CONNECTION_NOTE, lang)}
      </p>
      {zones.map((zone) => {
        const alert = getActiveAlertForZone(zone.id);
        return (
          <Card key={zone.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <span className="font-medium">{zone.name}</span>
              {alert ? (
                <SeverityBadge severity={alert.severity} />
              ) : (
                <span className="text-sm text-green-500">{t(CLEAR_NO_ALERT, lang)}</span>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- --run zone-alert-list-fallback.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add src/features/homepage-map/use-tiles-cached.ts src/features/homepage-map/use-tiles-cached.test.ts src/features/homepage-map/zone-alert-list-fallback.tsx src/features/homepage-map/zone-alert-list-fallback.test.tsx
git commit -m "feat: add offline detection hook and no-map fallback list view"
```

---

### Task 7a: Live bearing/distance ("direction to safety") indicator

PRD Core Feature #11 was extended after this plan was first written to add a live direction-to-safety indicator — compass bearing + distance from the resident's current position to their zone's evacuation center, computed client-side, no routing engine. This task adds that as a small, self-contained, fully unit-testable slice before Task 7 wires it into the map. It does **not** render a moving live-position marker on the map itself, and does not touch the onboarding consent notice's wording — both of those still belong to the deferred "live geolocation" follow-up flagged in this plan's Self-Review, because a rendered blue dot and consent-copy changes are a bigger, separate UX surface than a text readout.

**Files:**
- Create: `src/features/homepage-map/bearing-distance.ts`
- Test: `src/features/homepage-map/bearing-distance.test.ts`
- Create: `src/features/homepage-map/use-live-position.ts`
- Test: `src/features/homepage-map/use-live-position.test.ts`

**Interfaces:**
- Produces: `getBearingAndDistance(from: {lat:number,lng:number}, to: {lat:number,lng:number}): { bearingDeg: number; distanceMeters: number; compassLabel: string }`; `useLivePosition(): {lat:number,lng:number} | null`.

- [ ] **Step 1: Write the failing bearing/distance test**

Create `src/features/homepage-map/bearing-distance.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { getBearingAndDistance } from "./bearing-distance";

describe("getBearingAndDistance", () => {
  it("computes distance in meters using the haversine formula", () => {
    // ~111m per 0.001 degree of latitude at this latitude
    const result = getBearingAndDistance({ lat: 14.656, lng: 121.1015 }, { lat: 14.657, lng: 121.1005 });
    expect(result.distanceMeters).toBeGreaterThan(100);
    expect(result.distanceMeters).toBeLessThan(200);
  });

  it("labels due north as N", () => {
    const result = getBearingAndDistance({ lat: 14.0, lng: 121.0 }, { lat: 14.01, lng: 121.0 });
    expect(result.compassLabel).toBe("N");
  });

  it("labels due east as E", () => {
    const result = getBearingAndDistance({ lat: 14.0, lng: 121.0 }, { lat: 14.0, lng: 121.01 });
    expect(result.compassLabel).toBe("E");
  });

  it("returns zero distance for the same point", () => {
    const point = { lat: 14.656, lng: 121.1015 };
    expect(getBearingAndDistance(point, point).distanceMeters).toBeCloseTo(0, 0);
  });
});
```

- [ ] **Step 2: Verify it fails, then implement**

Run: `npm test -- --run bearing-distance.test.ts` → FAIL (module missing).

Create `src/features/homepage-map/bearing-distance.ts`:
```typescript
const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

const COMPASS_LABELS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function compassLabelFor(bearingDeg: number): string {
  const index = Math.round(bearingDeg / 45) % 8;
  return COMPASS_LABELS[index];
}

/**
 * Straight-line bearing and distance only — not a walkable route. This
 * can't know what's physically between the two points (a building, a
 * flooded street), which is why the UI must label it as a direction, not
 * a path, per PRD Core Feature #11.
 */
export function getBearingAndDistance(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): { bearingDeg: number; distanceMeters: number; compassLabel: string } {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const distanceMeters = EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  const bearingDeg = (Math.atan2(y, x) * 180) / Math.PI;
  const normalizedBearing = (bearingDeg + 360) % 360;

  return {
    bearingDeg: normalizedBearing,
    distanceMeters,
    compassLabel: compassLabelFor(normalizedBearing),
  };
}
```

- [ ] **Step 3: Run it to verify it passes**

Run: `npm test -- --run bearing-distance.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 4: Write the failing live-position hook test**

Create `src/features/homepage-map/use-live-position.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLivePosition } from "./use-live-position";

describe("useLivePosition", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      geolocation: {
        watchPosition: vi.fn((success) => {
          success({ coords: { latitude: 14.656, longitude: 121.1015 } });
          return 1;
        }),
        clearWatch: vi.fn(),
      },
    });
  });

  it("returns the watched position once geolocation reports one", async () => {
    const { result } = renderHook(() => useLivePosition());
    await waitFor(() => expect(result.current).toEqual({ lat: 14.656, lng: 121.1015 }));
  });

  it("returns null when geolocation is unavailable", () => {
    vi.stubGlobal("navigator", {});
    const { result } = renderHook(() => useLivePosition());
    expect(result.current).toBeNull();
  });
});
```

- [ ] **Step 5: Verify it fails, then implement**

Run: `npm test -- --run use-live-position.test.ts` → FAIL (module missing).

Create `src/features/homepage-map/use-live-position.ts`:
```typescript
"use client";

import { useEffect, useState } from "react";

/**
 * Low-frequency/low-accuracy watch per PRD Non-Functional Requirements
 * (limits battery drain). Returns null on denial, unavailability, or
 * before the first fix arrives — every call site must handle null by
 * falling back to the existing static pre-authored route text, never a
 * loading spinner blocking the rest of the page.
 */
export function useLivePosition(): { lat: number; lng: number } | null {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setPosition(null),
      { enableHighAccuracy: false, maximumAge: 30000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return position;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- --run use-live-position.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add src/features/homepage-map/bearing-distance.ts src/features/homepage-map/bearing-distance.test.ts src/features/homepage-map/use-live-position.ts src/features/homepage-map/use-live-position.test.ts
git commit -m "feat: add live bearing/distance direction-to-safety calculation"
```

---

### Task 7: The HomepageMap Leaflet component

**Files:**
- Create: `src/features/homepage-map/homepage-map.tsx`
- Test: `src/features/homepage-map/homepage-map.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–6 (`MOCK_ZONES`, `getPOIsForZone`, `getHazardSusceptibilityForZone`, `getActiveAlertForZone`, `getZoneStatus`, `hazardRiskColor`, `createStatusMarkerIcon`/`createPoiMarkerIcon`/`createEvacuationMarkerIcon`, `MarkerLegend`, `HazardTypeSelector`) and Task 7a (`getBearingAndDistance`, `useLivePosition`).
- Produces: `<HomepageMap zones={Zone[]} />` — the only export; this is the component `src/app/page.tsx` will dynamically import in Task 8.

- [ ] **Step 1: Write the smoke test**

Create `src/features/homepage-map/homepage-map.test.tsx`:
```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomepageMap } from "./homepage-map";
import { MOCK_ZONES } from "@/lib/mock-data";

/**
 * jsdom has no real layout engine, and Leaflet computes marker/tile
 * positions from actual container geometry. This is deliberately a shallow
 * smoke test — it checks that the component mounts and renders our own
 * legend/selector UI without throwing, not that Leaflet's internal pixel
 * math is correct. That's Leaflet's own tested responsibility, the same
 * principle already applied to Radix primitives elsewhere in this codebase.
 */
describe("HomepageMap", () => {
  it("renders without throwing and shows the marker legend and hazard selector", () => {
    render(<HomepageMap zones={MOCK_ZONES} />);
    expect(screen.getByText(/map legend/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /flood/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- --run homepage-map.test.tsx`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement**

Create `src/features/homepage-map/homepage-map.tsx`:
```typescript
"use client";

import { useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, Polyline, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getActiveAlertForZone, getPOIsForZone, getHazardSusceptibilityForZone } from "@/lib/mock-data";
import { getZoneStatus, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { hazardRiskColor } from "./hazard-color";
import { createStatusMarkerIcon, createPoiMarkerIcon, createEvacuationMarkerIcon } from "./marker-icons";
import { MarkerLegend } from "./marker-legend";
import { HazardTypeSelector } from "./hazard-type-selector";
import { getBearingAndDistance } from "./bearing-distance";
import { useLivePosition } from "./use-live-position";
import type { HazardType, LocalizedText, Zone } from "@/lib/types";

const HAZARD_ZONE_STATUSES = new Set(["dangerous", "hazardous"]);

const SAFEST_ROUTE_TO: LocalizedText = { en: "Safest route to", fil: "Pinakaligtas na ruta papunta sa" };
const PASSES_THROUGH_HAZARD: LocalizedText = {
  en: "This is the best available path, but it passes through a hazardous area.",
  fil: "Ito ang pinakamagandang ruta na available, pero dumadaan ito sa mapanganib na lugar.",
};
const DIRECTION_TO_SAFETY: LocalizedText = { en: "away", fil: "ang layo" };

export function HomepageMap({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const [hazardType, setHazardType] = useState<HazardType>("flood");
  const [routeZoneId, setRouteZoneId] = useState<string | null>(null);
  const livePosition = useLivePosition();

  const center: [number, number] = [zones[0].lat, zones[0].lng];
  const routeZone = zones.find((z) => z.id === routeZoneId) ?? null;
  const directionToSafety =
    routeZone && livePosition
      ? getBearingAndDistance(livePosition, {
          lat: routeZone.evacuationCenterLat,
          lng: routeZone.evacuationCenterLng,
        })
      : null;
  const routeCrossesHazard = routeZone
    ? zones.some(
        (z) =>
          HAZARD_ZONE_STATUSES.has(getZoneStatus(getActiveAlertForZone(z.id))) &&
          z.id !== routeZone.id &&
          routeZone.evacuationRoutePath.some(
            ([lat, lng]) => Math.abs(lat - z.lat) < 0.003 && Math.abs(lng - z.lng) < 0.003
          )
      )
    : false;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <HazardTypeSelector value={hazardType} onChange={setHazardType} />

      <div className="h-[400px] w-full overflow-hidden rounded-md border-2 border-border">
        <MapContainer center={center} zoom={14} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {zones.map((zone) => {
            const risk = getHazardSusceptibilityForZone(zone.id)[hazardType];
            return (
              <Circle
                key={`hazard-${zone.id}`}
                center={[zone.lat, zone.lng]}
                radius={500}
                pathOptions={{
                  color: hazardRiskColor(risk),
                  fillColor: hazardRiskColor(risk),
                  fillOpacity: 0.2,
                  opacity: 0.3,
                  weight: 1,
                }}
              />
            );
          })}

          {zones.map((zone) => {
            const alert = getActiveAlertForZone(zone.id);
            const status = getZoneStatus(alert);
            const label = `${zone.name} — ${t(ZONE_STATUS_LABEL[status], lang)}`;
            return (
              <Marker
                key={`status-${zone.id}`}
                position={[zone.lat, zone.lng]}
                icon={createStatusMarkerIcon(status, label)}
                eventHandlers={{ click: () => setRouteZoneId(zone.id) }}
              >
                <Popup>{label}</Popup>
              </Marker>
            );
          })}

          {zones.map((zone) => (
            <Marker
              key={`evac-${zone.id}`}
              position={[zone.evacuationCenterLat, zone.evacuationCenterLng]}
              icon={createEvacuationMarkerIcon(zone.evacuationCenterName)}
            >
              <Popup>{zone.evacuationCenterName}</Popup>
            </Marker>
          ))}

          {zones.flatMap((zone) =>
            getPOIsForZone(zone.id).map((poi) => (
              <Marker
                key={poi.id}
                position={[poi.lat, poi.lng]}
                icon={createPoiMarkerIcon(poi.category, poi.name)}
              >
                <Popup>{poi.name}</Popup>
              </Marker>
            ))
          )}

          {routeZone && (
            <Polyline
              positions={routeZone.evacuationRoutePath}
              pathOptions={{
                color: routeCrossesHazard ? "#7f1d1d" : "#0f766e",
                weight: 4,
                dashArray: routeCrossesHazard ? "6 6" : undefined,
              }}
            />
          )}
        </MapContainer>
      </div>

      {routeZone && (
        <p lang={lang} className="text-sm">
          {t(SAFEST_ROUTE_TO, lang)} {routeZone.evacuationCenterName}.{" "}
          {directionToSafety && (
            <span className="font-medium">
              {Math.round(directionToSafety.distanceMeters)}m {directionToSafety.compassLabel}{" "}
              {t(DIRECTION_TO_SAFETY, lang)}.
            </span>
          )}{" "}
          {routeCrossesHazard && (
            <span className="font-medium text-severity-evacuate">
              {t(PASSES_THROUGH_HAZARD, lang)}
            </span>
          )}
        </p>
      )}

      <MarkerLegend />
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- --run homepage-map.test.tsx`
Expected: PASS. If it fails specifically because jsdom throws inside Leaflet's `MapContainer` initialization (not because of an assertion mismatch), do not paper over it with a broad try/catch or a skip — read the actual error, check whether `global.ResizeObserver` (already mocked in `vitest.setup.ts`) is sufficient, and if a genuine jsdom/Leaflet incompatibility remains, escalate with the exact error rather than guessing at a workaround.

- [ ] **Step 5: Commit**

```bash
git add src/features/homepage-map/homepage-map.tsx src/features/homepage-map/homepage-map.test.tsx
git commit -m "feat: add the interactive homepage map component"
```

---

### Task 8: Wire the map into the homepage

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/features/a11y/accessibility.test.tsx`

**Interfaces:**
- Consumes: `HomepageMap` (dynamically imported, `ssr: false`), `ZoneAlertListFallback`, `useIsOnline` from Task 6, `MOCK_ZONES` from `mock-data.ts`, existing `OnboardingGate`.

- [ ] **Step 1: Replace the homepage**

Rewrite `src/app/page.tsx`:
```typescript
"use client";

import dynamic from "next/dynamic";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { ZoneAlertListFallback } from "@/features/homepage-map/zone-alert-list-fallback";
import { useIsOnline } from "@/features/homepage-map/use-tiles-cached";
import { MOCK_ZONES } from "@/lib/mock-data";
import { Skeleton } from "@/components/ui/skeleton";

const HomepageMap = dynamic(
  () => import("@/features/homepage-map/homepage-map").then((m) => m.HomepageMap),
  { ssr: false, loading: () => <Skeleton className="h-[400px] w-full max-w-2xl rounded-md" /> }
);

export default function Home() {
  const isOnline = useIsOnline();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <OnboardingGate />
      <h1 className="text-lg font-semibold">WeatherWell</h1>
      {isOnline ? <HomepageMap zones={MOCK_ZONES} /> : <ZoneAlertListFallback zones={MOCK_ZONES} />}
    </main>
  );
}
```

Note: this removes the old direct links to `/evacuation`, `/report`, `/map`, `/admin` from the homepage body. Before deleting them, check whether `src/components/emergency-hotline-button.tsx` or `src/app/layout.tsx` already surfaces persistent navigation to those routes (per PRD Core Feature #11, the hotline button is already persistent/independent of any single page). If nothing else links to `/evacuation`, `/report`, `/map`, or `/admin`, add a compact row of icon+label links below the map/fallback instead of silently dropping navigation — do not leave those routes unreachable. Check `src/app/layout.tsx` before deciding how.

- [ ] **Step 2: Add the homepage map and fallback to the accessibility audit**

In `src/features/a11y/accessibility.test.tsx`, add imports:
```typescript
import { ZoneAlertListFallback } from "@/features/homepage-map/zone-alert-list-fallback";
import { MarkerLegend } from "@/features/homepage-map/marker-legend";
```

Add before the final closing `});`:
```typescript
  it("zone alert list fallback has no violations", async () => {
    expect(await violationsFor(<ZoneAlertListFallback zones={MOCK_ZONES} />)).toEqual([]);
  });

  it("marker legend has no violations", async () => {
    expect(await violationsFor(<MarkerLegend />)).toEqual([]);
  });
```

Do not add `HomepageMap` itself to this axe suite — Leaflet's internal DOM (map panes, tile containers) is a third-party library's rendering, not this app's own markup, and jsdom's lack of real layout makes axe's geometry-dependent rules (already disabled here for `color-contrast`) even less meaningful against it. `MarkerLegend` and `HazardTypeSelector` (already covered by their own component tests) carry the audit-able UI.

- [ ] **Step 3: Run full verification**

Run: `npm run lint && npm test -- --run && npm run build`
Expected: all green.

- [ ] **Step 4: Manual verification in the browser**

Start the dev server and open the homepage. Confirm: the map renders with a visible hazard-tile wash under each zone, three colored/shaped status markers appear, evacuation and POI markers appear with their icons, clicking a status marker draws a route to that zone's evacuation center, the hazard type selector switches the backdrop color, and the marker legend is visible below the map. This step exists because Task 7's automated test is deliberately shallow (see its jsdom caveat) — this is where real rendering actually gets checked.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/features/a11y/accessibility.test.tsx
git commit -m "feat: replace the alert-card homepage with the interactive map"
```

---

## Self-Review

**Spec coverage:** hazard-tile backdrop (Task 7, mocked per Task 1 data), zone-status markers with shape+color (Task 3/7), evacuation + POI markers (Task 1/3/7), persistent marker legend (Task 4/7), safest-route-to-evacuation-center with hazard flagging (Task 7), live bearing/distance direction-to-safety indicator (Task 7a/7), offline fallback list view (Task 6/8), no drawn zone boundaries (never implemented — correct, by omission).

Three gaps found and intentionally deferred, not silently dropped:
1. **A rendered live-position marker on the map itself** (a moving blue dot showing where the resident is) — Task 7a's `useLivePosition` hook feeds the bearing/distance *text* readout, but nothing in this plan draws the position as a map marker. That's a bigger visual/UX surface (icon design, what happens while position is null, whether it recenters the map) deserving its own task.
2. **The onboarding consent notice's wording** for continuous (`watchPosition`) location use, distinct from the existing one-time fetch — PRD Privacy & Data calls for this explicitly; this plan doesn't touch `consent-notice.tsx`.
3. **Personal Status Headline and Current Conditions panel** (PRD Core Features #9–#10, added after this plan was first written) are entirely separate, standalone components that sit above the map, not modifications to it — out of scope for this plan by the same "separate subsystem" logic that kept Community Flood Pins out. They need their own plan.

Flag all three to the user as follow-ups after this plan ships, not silent gaps.

**Placeholder scan:** The marker-icon glyphs in Task 3 are flagged inline as needing a real-icon swap rather than left as an unflagged placeholder — that's a deliberate, disclosed shortcut, not a plan failure.

**Type consistency:** `HazardType`/`HazardRiskLevel`/`POICategory`/`PointOfInterest` are defined once in Task 1 and imported (never redefined) in Tasks 3, 5, 7. `ZoneStatus`/`getZoneStatus`/`getZoneStatusColor`/`ZONE_STATUS_LABEL` defined once in Task 2, imported in Tasks 3, 4, 7. `hazardRiskColor` defined once in Task 3, imported in Task 7. `getBearingAndDistance`/`useLivePosition` defined once in Task 7a, imported in Task 7. Confirmed no signature drift across tasks.
