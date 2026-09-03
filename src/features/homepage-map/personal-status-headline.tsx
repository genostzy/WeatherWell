"use client";

import { ShieldCheck, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getActiveAlertForZone } from "@/lib/mock-data";
import { getZoneStatus, getZoneStatusColor, type ZoneStatus } from "@/lib/zone-status";
import type { LocalizedText, Zone } from "@/lib/types";

const STATUS_HEADLINE: Record<ZoneStatus, LocalizedText> = {
  safe: { en: "You are safe", fil: "Ligtas ka" },
  cautionary: { en: "Stay alert in your area", fil: "Mag-ingat sa iyong lugar" },
  dangerous: { en: "Danger in your area", fil: "Mapanganib sa iyong lugar" },
  hazardous: { en: "Evacuate now", fil: "Lumikas na ngayon" },
};

/**
 * The resident's own zone status, shown first-person at the top of the
 * homepage. Reuses the same safe/cautionary/dangerous/hazardous scale (and
 * exact severity color) already driving the map markers and legend — this is
 * a presentation of that existing data, not a new status model.
 */
export function PersonalStatusHeadline({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  const alert = getActiveAlertForZone(zone.id);
  const status = getZoneStatus(alert);
  const color = getZoneStatusColor(alert);
  const Icon = status === "safe" ? ShieldCheck : TriangleAlert;

  return (
    <div
      className="flex w-full max-w-2xl items-center gap-3 rounded-md border-2 p-3 lg:max-w-5xl"
      style={{ borderColor: color, backgroundColor: `${color}1a` }}
    >
      <Icon aria-hidden="true" className="h-8 w-8 shrink-0" style={{ color }} />
      <div>
        <h1 lang={lang} className="text-lg font-semibold md:text-xl" style={{ color }}>
          {t(STATUS_HEADLINE[status], lang)}
        </h1>
        <p className="text-sm text-muted-foreground">{zone.name}</p>
      </div>
    </div>
  );
}
