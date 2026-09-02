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
