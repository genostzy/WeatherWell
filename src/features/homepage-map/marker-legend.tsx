"use client";

import { useState, type ComponentType } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Droplet,
  Landmark,
  Pill,
  ShoppingBasket,
  Stethoscope,
} from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { ZONE_STATUS_LABEL, SAFE_HEX, type ZoneStatus } from "@/lib/zone-status";
import { SEVERITY_HEX } from "@/lib/severity";
import { STATUS_SHAPE_STYLE } from "./status-shape";
import type { LocalizedText } from "@/lib/types";

const ZONE_STATUS_ORDER: ZoneStatus[] = ["safe", "cautionary", "dangerous", "hazardous"];

/**
 * Representative colors for the legend's abstract "what does this shape+hue
 * mean" swatches — not tied to any single live alert. Cautionary covers both
 * yellow (Advisory) and orange (Watch) severities on the real map (see
 * getZoneStatusColor); orange is used here as the representative hue.
 */
const STATUS_SWATCH_COLOR: Record<ZoneStatus, string> = {
  safe: SAFE_HEX,
  cautionary: SEVERITY_HEX.orange,
  dangerous: SEVERITY_HEX.red,
  hazardous: SEVERITY_HEX.evacuate,
};

const MARKER_LEGEND_ITEMS: { key: string; label: LocalizedText; icon: ComponentType<{ size?: number }> }[] = [
  { key: "evacuation", label: { en: "Evacuation center", fil: "Evacuation center" }, icon: Building2 },
  { key: "health_center", label: { en: "Health center", fil: "Health center" }, icon: Stethoscope },
  { key: "pharmacy", label: { en: "Pharmacy", fil: "Botika" }, icon: Pill },
  { key: "market", label: { en: "Market", fil: "Palengke" }, icon: ShoppingBasket },
  { key: "water_station", label: { en: "Water refilling station", fil: "Water station" }, icon: Droplet },
  { key: "barangay_office", label: { en: "Barangay office", fil: "Barangay office" }, icon: Landmark },
];

const LEGEND_TITLE: LocalizedText = { en: "Map legend", fil: "Legend ng Mapa" };
const SEE_MORE: LocalizedText = { en: "See more", fil: "Tingnan pa" };
const SEE_LESS: LocalizedText = { en: "See less", fil: "Bawasan" };

/**
 * STATUS_SHAPE_STYLE (shared with marker-icons.ts, which interpolates it
 * into a plain HTML string for Leaflet) is authored as raw CSS text. React's
 * `style` prop needs a JS object, so this converts one or more
 * `property: value;` declarations into that shape — kept local to this file
 * since marker-icons.ts never needs the object form.
 */
function cssTextToStyleObject(cssText: string): Record<string, string> {
  const style: Record<string, string> = {};
  for (const declaration of cssText.split(";")) {
    const [rawProperty, rawValue] = declaration.split(":");
    if (!rawProperty || !rawValue) continue;
    const camelProperty = rawProperty.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    style[camelProperty] = rawValue.trim();
  }
  return style;
}

/**
 * Compact by design — meant to float as a small overlay inside the map
 * itself (see HomepageMap), not sit as a full-width block below it.
 */
export function MarkerLegend() {
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const ChevronIcon = expanded ? ChevronUp : ChevronDown;

  return (
    <div className="w-fit max-w-[200px] space-y-1.5 rounded-md border-2 border-border bg-background/95 p-2 text-xs shadow-md">
      <p className="font-semibold">{t(LEGEND_TITLE, lang)}</p>
      <div className="space-y-1">
        {ZONE_STATUS_ORDER.map((status) => (
          <div key={status} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0"
              style={{ background: STATUS_SWATCH_COLOR[status], ...cssTextToStyleObject(STATUS_SHAPE_STYLE[status]) }}
              aria-hidden="true"
            />
            <span>{t(ZONE_STATUS_LABEL[status], lang)}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="marker-legend-poi-icons"
        className="flex items-center gap-1 text-muted-foreground underline-offset-2 hover:underline"
      >
        {t(expanded ? SEE_LESS : SEE_MORE, lang)}
        <ChevronIcon aria-hidden="true" className="h-3 w-3" />
      </button>

      {expanded && (
        <div id="marker-legend-poi-icons" className="space-y-1 text-muted-foreground">
          {MARKER_LEGEND_ITEMS.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <span
                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-foreground/60 text-background"
                aria-hidden="true"
              >
                <item.icon size={10} />
              </span>
              <span>{t(item.label, lang)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
