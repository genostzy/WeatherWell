import L from "leaflet";
import type { ZoneStatus } from "@/lib/zone-status";
import type { POICategory } from "@/lib/types";
import type { PinStatusTag } from "@/lib/community-pin";
import { PIN_STATUS_COLOR } from "@/lib/community-pin";
import type { OfficialMarkerType } from "@/lib/official-markers";
import { OFFICIAL_MARKER_COLOR } from "@/lib/official-markers";
import { STATUS_SHAPE_STYLE } from "./status-shape";

/**
 * Leaflet's default marker images 404 under bundlers (a well-known gotcha),
 * and we need colorblind-safe shape differentiation anyway, so every marker
 * here is a small inline-styled divIcon instead — CSS shape, not an image.
 */

/**
 * `L.divIcon`'s `html` is assigned via `innerHTML` by Leaflet, so any raw
 * `label` interpolated into it is live markup, not text. Today's call sites
 * only pass hardcoded literals, but this is shared infrastructure future
 * tasks will feed real zone/POI names and eventually user-submitted pin
 * captions through, so every label is escaped before interpolation.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The color itself comes from the caller via `getZoneStatusColor` (see
 * @/lib/zone-status) — the single source of truth for severity colors used
 * everywhere else in the app (e.g. SeverityBadge). This module only owns the
 * *shape* that differentiates statuses for colorblind users, via
 * STATUS_SHAPE_STYLE (shared with marker-legend.tsx).
 */
export function createStatusMarkerIcon(status: ZoneStatus, color: string, label: string): L.DivIcon {
  const shape = STATUS_SHAPE_STYLE[status];
  return L.divIcon({
    className: `zone-status-marker zone-status-marker--${status}`,
    html: `<div role="img" aria-label="${escapeHtml(label)}" style="width:22px;height:22px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);${shape}"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Icon glyphs come from lucide-react — this project's single icon set (see
 * zone-map.tsx, evacuation-instructions.tsx) — never raw HTML entities or
 * emoji. `L.divIcon`'s `html` option takes a plain HTML string rather than
 * JSX, so rather than pulling react-dom/server's `renderToStaticMarkup` into
 * this client bundle to render these icons at runtime, each icon's static
 * SVG markup (six icons, none of which ever change) was captured once
 * ahead of time and is inlined below as a plain string constant.
 */
const POI_ICON_SVG: Record<POICategory, string> = {
  health_center:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-stethoscope" aria-hidden="true"><path d="M11 2v2"></path><path d="M5 2v2"></path><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"></path><path d="M8 15a6 6 0 0 0 12 0v-3"></path><circle cx="20" cy="10" r="2"></circle></svg>',
  pharmacy:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pill" aria-hidden="true"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"></path><path d="m8.5 8.5 7 7"></path></svg>',
  market:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shopping-basket" aria-hidden="true"><path d="m15 11-1 9"></path><path d="m19 11-4-7"></path><path d="M2 11h20"></path><path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4"></path><path d="M4.5 15.5h15"></path><path d="m5 11 4-7"></path><path d="m9 11 1 9"></path></svg>',
  water_station:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-droplet" aria-hidden="true"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path></svg>',
  barangay_office:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-landmark" aria-hidden="true"><path d="M10 18v-7"></path><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"></path><path d="M14 18v-7"></path><path d="M18 18v-7"></path><path d="M3 22h18"></path><path d="M6 18v-7"></path></svg>',
};

const EVACUATION_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-building2 lucide-building-2" aria-hidden="true"><path d="M10 12h4"></path><path d="M10 8h4"></path><path d="M14 21v-3a2 2 0 0 0-4 0v3"></path><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"></path><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"></path></svg>';

const POI_BG_COLOR: Record<POICategory, string> = {
  health_center: "#dc2626",
  pharmacy: "#16a34a",
  market: "#d97706",
  water_station: "#2563eb",
  barangay_office: "#6b7280",
};

export function createPoiMarkerIcon(category: POICategory, label: string): L.DivIcon {
  const bg = POI_BG_COLOR[category] ?? "#1f2937";
  return L.divIcon({
    className: `poi-marker poi-marker--${category}`,
    html: `<div role="img" aria-label="${escapeHtml(label)}" style="width:24px;height:24px;background:${bg};border:2px solid white;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;">${POI_ICON_SVG[category]}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function createEvacuationMarkerIcon(
  label: string,
  capacityRatio?: number,
): L.DivIcon {
  // Capacity ring: a colored arc around the marker showing occupancy.
  // ratio 0-0.5 = green, 0.5-0.8 = amber, 0.8-1.0 = red, undefined = no ring.
  let ringHtml = "";
  if (capacityRatio !== undefined && capacityRatio >= 0) {
    const ratio = Math.min(capacityRatio, 1);
    const ringColor = ratio >= 0.8 ? "#dc2626" : ratio >= 0.5 ? "#f59e0b" : "#16a34a";
    // SVG conic ring (stroke-dasharray trick on a circle)
    const circumference = 2 * Math.PI * 11;
    const filled = circumference * ratio;
    ringHtml = `<svg width="30" height="30" viewBox="0 0 30 30" style="position:absolute;top:-2px;left:-2px;"><circle cx="15" cy="15" r="11" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2.5"/><circle cx="15" cy="15" r="11" fill="none" stroke="${ringColor}" stroke-width="2.5" stroke-dasharray="${filled} ${circumference - filled}" stroke-dashoffset="${circumference * 0.25}" stroke-linecap="round"/></svg>`;
  }
  return L.divIcon({
    className: "evacuation-marker",
    html: `<div role="img" aria-label="${escapeHtml(label)}" style="position:relative;width:26px;height:26px;">${ringHtml}<div style="width:26px;height:26px;background:#0f766e;border:2px solid white;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:13px;">${EVACUATION_ICON_SVG}</div></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

/**
 * A pulsing blue dot for the user's live GPS position — the standard
 * "you are here" convention (Google Maps, Apple Maps). The outer ring
 * pulses via CSS animation so it's visually distinct from static markers.
 */
export function createUserLocationIcon(): L.DivIcon {
  return L.divIcon({
    className: "user-location-marker",
    html: `<div role="img" aria-label="Your location" style="position:relative;width:20px;height:20px;">
      <span style="position:absolute;inset:-6px;border-radius:50%;background:rgba(59,130,246,0.25);animation:user-location-pulse 2s ease-out infinite;"></span>
      <span style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></span>
    </div>
    <style>@keyframes user-location-pulse{0%{transform:scale(1);opacity:0.7}100%{transform:scale(2.5);opacity:0}}</style>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/**
 * A clustered evac-center marker showing how many centers are in a
 * municipality. Used when zoomed out to avoid rendering every individual
 * center.
 */
export function createClusteredEvacMarkerIcon(municipality: string, count: number): L.DivIcon {
  return L.divIcon({
    className: "evacuation-cluster-marker",
    html: `<div role="img" aria-label="${escapeHtml(`${count} evacuation centers in ${municipality}`)}" style="width:32px;height:32px;background:#0f766e;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${count}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

const PIN_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"></path><circle cx="12" cy="10" r="3"></circle></svg>';

/**
 * A dashed border (vs. the official markers' solid border) plus a distinct
 * pin-shaped glyph — community pins are a clearly-labeled, unverified
 * citizen layer (PRD Core Feature #5), never visually confusable with an
 * official zone-status/evacuation/POI marker.
 */
export function createCommunityPinMarkerIcon(statusTag: PinStatusTag, label: string): L.DivIcon {
  return L.divIcon({
    className: `community-pin-marker community-pin-marker--${statusTag}`,
    html: `<div role="img" aria-label="${escapeHtml(label)}" style="width:24px;height:24px;background:${PIN_STATUS_COLOR[statusTag]};border:2px dashed white;border-radius:50% 50% 50% 0;transform:rotate(45deg);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(-45deg);display:flex;">${PIN_ICON_SVG}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 26],
  });
}

/**
 * Official markers placed manually by admins/operators. Solid border + distinct
 * icon per type — clearly different from the dashed-border community pins.
 * Uses a hexagon shape to distinguish from the zone-status shapes (circle,
 * triangle, diamond, octagon).
 */
const OFFICIAL_MARKER_ICON_SVG: Record<OfficialMarkerType, string> = {
  flood: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16c.6.5 1.2 1 2.5 1C7 17 7 12 12 12c4.5 0 5 5 7.5 5 1.3 0 1.9-.5 2.5-1"/></svg>',
  road_damage: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M2 14l4-4 4 4 4-4 4 4"/></svg>',
  blocked: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>',
  power_outage: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  water_issue: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>',
  landslide: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>',
  other: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
};

export function createOfficialMarkerIcon(type: OfficialMarkerType, label: string): L.DivIcon {
  const color = OFFICIAL_MARKER_COLOR[type];
  const svg = OFFICIAL_MARKER_ICON_SVG[type];
  return L.divIcon({
    className: `official-marker official-marker--${type}`,
    html: `<div role="img" aria-label="${escapeHtml(label)}" style="width:26px;height:26px;background:${color};border:2.5px solid white;border-radius:6px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.4);">${svg}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}
