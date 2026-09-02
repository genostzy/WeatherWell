import L from "leaflet";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Building2,
  Droplet,
  Landmark,
  Pill,
  ShoppingBasket,
  Stethoscope,
} from "lucide-react";
import type { ZoneStatus } from "@/lib/zone-status";
import type { POICategory } from "@/lib/types";

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
    html: `<div role="img" aria-label="${escapeHtml(label)}" style="width:22px;height:22px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);${shape}"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * Icon glyphs come from lucide-react — this project's single icon set (see
 * zone-map.tsx, evacuation-instructions.tsx) — never raw HTML entities or
 * emoji. `L.divIcon`'s `html` option takes a plain HTML string rather than
 * JSX, so each icon component is pre-rendered once to static SVG markup via
 * `renderToStaticMarkup` and that string is embedded inside the colored
 * marker wrapper below.
 */
const POI_ICON_SVG: Record<POICategory, string> = {
  health_center: renderToStaticMarkup(
    createElement(Stethoscope, { size: 14, color: "white", "aria-hidden": true })
  ),
  pharmacy: renderToStaticMarkup(
    createElement(Pill, { size: 14, color: "white", "aria-hidden": true })
  ),
  market: renderToStaticMarkup(
    createElement(ShoppingBasket, { size: 14, color: "white", "aria-hidden": true })
  ),
  water_station: renderToStaticMarkup(
    createElement(Droplet, { size: 14, color: "white", "aria-hidden": true })
  ),
  barangay_office: renderToStaticMarkup(
    createElement(Landmark, { size: 14, color: "white", "aria-hidden": true })
  ),
};

const EVACUATION_ICON_SVG = renderToStaticMarkup(
  createElement(Building2, { size: 14, color: "white", "aria-hidden": true })
);

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
