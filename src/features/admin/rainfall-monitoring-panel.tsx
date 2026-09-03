"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CloudRain, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getRainfallForZone, getRainfallHistoryForZone, isHeavyRainfall } from "@/lib/mock-data";
import { SEVERITY_HEX } from "@/lib/severity";
import { TrendChart } from "./charts/trend-chart";
import type { LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Heavy Rainfall Monitoring", fil: "Pagsubaybay sa Malakas na Ulan" };
const SUBTITLE: LocalizedText = { en: "Last 12 hours, per zone", fil: "Huling 12 oras, bawat zone" };
const HEAVY: LocalizedText = { en: "Heavy", fil: "Malakas" };
const NORMAL: LocalizedText = { en: "Normal", fil: "Normal" };
const PEAK: LocalizedText = { en: "12h peak", fil: "12h pinakamataas" };
const RISING: LocalizedText = { en: "Rising", fil: "Tumataas" };
const FALLING: LocalizedText = { en: "Falling", fil: "Bumababa" };
const STEADY: LocalizedText = { en: "Steady", fil: "Pantay" };

/** Compares the newest reading to the one six hours back — enough distance that hour-to-hour noise doesn't flip the arrow. */
function getTrend(history: number[]): "rising" | "falling" | "steady" {
  if (history.length < 2) return "steady";
  const latest = history[history.length - 1];
  const earlier = history[Math.max(0, history.length - 7)];
  if (latest > earlier + 1) return "rising";
  if (latest < earlier - 1) return "falling";
  return "steady";
}

const TREND_ICON = { rising: TrendingUp, falling: TrendingDown, steady: Minus };
const TREND_LABEL: Record<"rising" | "falling" | "steady", LocalizedText> = {
  rising: RISING,
  falling: FALLING,
  steady: STEADY,
};

export function RainfallMonitoringPanel({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudRain aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t(SUBTITLE, lang)}</p>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        {zones.map((zone) => {
          const mmPerHour = getRainfallForZone(zone.id);
          const history = getRainfallHistoryForZone(zone.id);
          const heavy = isHeavyRainfall(mmPerHour);
          const trend = getTrend(history);
          const TrendIcon = TREND_ICON[trend];
          return (
            <div key={zone.id} className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{zone.name}</span>
                <Badge
                  className={heavy ? "bg-severity-orange text-black" : "bg-muted text-muted-foreground"}
                >
                  {t(heavy ? HEAVY : NORMAL, lang)}
                </Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold tabular-nums">{mmPerHour}</span>
                <span className="text-xs text-muted-foreground">mm/hr</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  {t(TREND_LABEL[trend], lang)}
                </span>
              </div>
              <TrendChart
                series={history}
                color={heavy ? SEVERITY_HEX.orange : SEVERITY_HEX.yellow}
                label={`${zone.name} rainfall, last 12 hours`}
                unit="mm/hr"
              />
              <p className="text-xs text-muted-foreground">
                {t(PEAK, lang)}: {Math.max(...history)} mm/hr
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
