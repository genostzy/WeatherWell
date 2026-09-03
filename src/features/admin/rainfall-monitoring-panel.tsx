"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CloudRain } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getRainfallForZone, isHeavyRainfall } from "@/lib/mock-data";
import type { LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Heavy Rainfall Monitoring", fil: "Pagsubaybay sa Malakas na Ulan" };
const HEAVY: LocalizedText = { en: "Heavy", fil: "Malakas" };
const NORMAL: LocalizedText = { en: "Normal", fil: "Normal" };

export function RainfallMonitoringPanel({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudRain aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {zones.map((zone) => {
          const mmPerHour = getRainfallForZone(zone.id);
          const heavy = isHeavyRainfall(mmPerHour);
          return (
            <div key={zone.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{zone.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{mmPerHour} mm/hr</span>
                <Badge
                  className={
                    heavy
                      ? "bg-severity-orange text-black"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {t(heavy ? HEAVY : NORMAL, lang)}
                </Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
