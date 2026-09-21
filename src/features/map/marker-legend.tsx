"use client";

import { useState, type ComponentType } from "react";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Droplet,
  MapPin,
  Pill,
  ShoppingBasket,
  Stethoscope,
} from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { OFFICIAL_MARKER_TYPES, OFFICIAL_MARKER_LABEL, OFFICIAL_MARKER_COLOR } from "@/lib/official-markers";
import type { LocalizedText } from "@/lib/types";

const MARKER_LEGEND_ITEMS: {
  key: string;
  label: LocalizedText;
  icon: ComponentType<{ size?: number }>;
  /** Drawn outlined-and-dashed rather than filled, mirroring the real marker — see the community-pin entry below. */
  unverified?: boolean;
}[] = [
  { key: "evacuation", label: { en: "Evacuation center", fil: "Evacuation center" }, icon: Building2 },
  { key: "health_center", label: { en: "Health center", fil: "Health center" }, icon: Stethoscope },
  { key: "pharmacy", label: { en: "Pharmacy", fil: "Botika" }, icon: Pill },
  { key: "market", label: { en: "Market", fil: "Palengke" }, icon: ShoppingBasket },
  { key: "water_station", label: { en: "Water refilling station", fil: "Water station" }, icon: Droplet },
  {
    key: "community_pin",
    label: { en: "Community pin — unverified", fil: "Community pin — hindi pa na-verify" },
    icon: MapPin,
    unverified: true,
  },
];

const LEGEND_TITLE: LocalizedText = { en: "Map legend", fil: "Legend ng Mapa" };
const SEE_MORE: LocalizedText = { en: "See more", fil: "Tingnan pa" };
const SEE_LESS: LocalizedText = { en: "See less", fil: "Bawasan" };
const OFFICIAL_MARKERS_TITLE: LocalizedText = { en: "Official markers", fil: "Official marker" };

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

      {/* Official marker types */}
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t(OFFICIAL_MARKERS_TITLE, lang)}</p>
        {OFFICIAL_MARKER_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: OFFICIAL_MARKER_COLOR[type] }}
              aria-hidden="true"
            />
            <span>{t(OFFICIAL_MARKER_LABEL[type], lang)}</span>
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
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm ${
                  item.unverified
                    ? "border border-dashed border-foreground/70 text-foreground"
                    : "bg-foreground/60 text-background"
                }`}
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
