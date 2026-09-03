"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getReportHistoryForZone, getReportsTodayForZone } from "@/lib/mock-data";
import { SEVERITY_HEX } from "@/lib/severity";
import { TrendChart } from "./charts/trend-chart";
import { BarChart } from "./charts/bar-chart";
import type { LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Crowd Reports Over Time", fil: "Mga Ulat sa Paglipas ng Panahon" };
const SUBTITLE: LocalizedText = {
  en: "Water-level reports per zone, last 7 days",
  fil: "Mga ulat ng lalim ng tubig bawat zone, huling 7 araw",
};
const TODAY: LocalizedText = { en: "Reports today, by zone", fil: "Ulat ngayon, bawat zone" };
const TOTAL_WEEK: LocalizedText = { en: "reports this week", fil: "ulat ngayong linggo" };

/** Cycled so each zone's trend line is visually distinguishable; not severity-meaningful. */
const SERIES_COLORS = [SEVERITY_HEX.yellow, SEVERITY_HEX.orange, SEVERITY_HEX.red, "#38bdf8"];

export function ReportTrendPanel({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();

  const weekTotal = zones.reduce(
    (sum, zone) => sum + getReportHistoryForZone(zone.id).reduce((a, b) => a + b, 0),
    0
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t(SUBTITLE, lang)}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm">
          <span className="text-2xl font-bold tabular-nums">{weekTotal}</span>{" "}
          <span className="text-muted-foreground">{t(TOTAL_WEEK, lang)}</span>
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {zones.map((zone, index) => {
            const history = getReportHistoryForZone(zone.id);
            return (
              <div key={zone.id} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{zone.name}</span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {history[history.length - 1] ?? 0}
                  </span>
                </div>
                <TrendChart
                  series={history}
                  color={SERIES_COLORS[index % SERIES_COLORS.length]}
                  label={`${zone.name} water-level reports, last 7 days`}
                  height={48}
                />
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t(TODAY, lang)}</p>
          <BarChart
            data={zones.map((zone, index) => ({
              label: zone.name,
              value: getReportsTodayForZone(zone.id),
              color: SERIES_COLORS[index % SERIES_COLORS.length],
            }))}
          />
        </div>
      </CardContent>
    </Card>
  );
}
