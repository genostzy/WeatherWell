"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getAlertHistoryForZone, getFalseAlarmRate } from "@/lib/mock-data";
import { SEVERITY_HEX } from "@/lib/severity";
import { BarChart } from "./charts/bar-chart";
import type { LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Alert Frequency & False Alarms", fil: "Dalas ng Alerto at Maling Alarma" };
const SUBTITLE: LocalizedText = {
  en: "Alerts issued per zone in the last 30 days; the darker inset is how many were later downgraded",
  fil: "Mga alertong na-issue bawat zone sa huling 30 araw; ang mas madilim ay ang na-downgrade",
};
const DOWNGRADED: LocalizedText = { en: "downgraded", fil: "na-downgrade" };
const FALSE_ALARM_RATE: LocalizedText = { en: "False-alarm rate", fil: "Rate ng Maling Alarma" };
const TARGET: LocalizedText = { en: "PRD target: ≤ 10%", fil: "Target ng PRD: ≤ 10%" };
const ON_TARGET: LocalizedText = { en: "On target", fil: "Nasa target" };
const OVER_TARGET: LocalizedText = { en: "Over target", fil: "Lampas sa target" };
const TRANSPARENCY_NOTE: LocalizedText = {
  en: "Every downgrade is shown to residents as a downgrade, never silently removed.",
  fil: "Bawat downgrade ay ipinapakita sa mga residente, hindi basta tinatanggal nang tahimik.",
};

const FALSE_ALARM_TARGET_PERCENT = 10;

export function AlertAnalyticsPanel({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const falseAlarmRate = getFalseAlarmRate();
  const onTarget = falseAlarmRate <= FALSE_ALARM_TARGET_PERCENT;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t(SUBTITLE, lang)}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{t(FALSE_ALARM_RATE, lang)}</p>
            <p
              className="text-2xl font-bold tabular-nums"
              style={{ color: onTarget ? "#22c55e" : SEVERITY_HEX.red }}
            >
              {falseAlarmRate}%
            </p>
          </div>
          <Badge className={onTarget ? "bg-green-500/20 text-green-400" : "bg-severity-red text-white"}>
            {t(onTarget ? ON_TARGET : OVER_TARGET, lang)}
          </Badge>
          <span className="text-xs text-muted-foreground">{t(TARGET, lang)}</span>
        </div>

        <BarChart
          data={zones.map((zone) => {
            const history = getAlertHistoryForZone(zone.id);
            return {
              label: zone.name,
              value: history.issued,
              subValue: history.downgraded,
              subLabel: t(DOWNGRADED, lang),
              color: SEVERITY_HEX.orange,
            };
          })}
        />

        <p lang={lang} className="text-xs text-muted-foreground">
          {t(TRANSPARENCY_NOTE, lang)}
        </p>
      </CardContent>
    </Card>
  );
}
