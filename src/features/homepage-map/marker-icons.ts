import L from "leaflet";
import type { ZoneStatus } from "@/lib/zone-status";
import type { POICategory } from "@/lib/types";
import type { PinStatusTag } from "@/lib/community-pin";
import { PIN_STATUS_COLOR } from "@/lib/community-pin";
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

export function createPoiMarkerIcon(category: POICategory, label: string): L.DivIcon {
  return L.divIcon({
    className: `poi-marker poi-marker--${category}`,
    html: `<div role="img" aria-label="${escapeHtml(label)}" style="width:24px;height:24px;background:#1f2937;border:2px solid white;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;">${POI_ICON_SVG[category]}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function createEvacuationMarkerIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: "evacuation-marker",
    html: `<div role="img" aria-label="${escapeHtml(label)}" style="width:26px;height:26px;background:#0f766e;border:2px solid white;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-size:13px;">${EVACUATION_ICON_SVG}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
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
