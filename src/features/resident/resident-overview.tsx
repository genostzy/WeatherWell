"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "My Dashboard", fil: "Aking Dashboard" };
const ZONE_LABEL: LocalizedText = { en: "Zone", fil: "Zone" };
const NO_ZONE_SELECTED: LocalizedText = { en: "No zone selected", fil: "Walang napiling zone" };
const REPORTS: LocalizedText = { en: "Reports", fil: "Mga Ulat" };
const CHECK_INS: LocalizedText = { en: "Check-ins", fil: "Mga Check-in" };
const PINS: LocalizedText = { en: "Pins", fil: "Mga Pin" };

export interface ResidentOverviewData {
  zoneName: string | null;
  reportCount: number;
  checkInCount: number;
  pinCount: number;
}

export function ResidentOverview({ zoneName, reportCount, checkInCount, pinCount }: ResidentOverviewData) {
  const { lang } = useLanguage();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t(TITLE, lang)}</h1>
      <p className="text-sm text-muted-foreground">
        {t(ZONE_LABEL, lang)}: {zoneName ?? t(NO_ZONE_SELECTED, lang)}
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-2xl font-bold">{reportCount}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-muted-foreground">{t(REPORTS, lang)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-2xl font-bold">{checkInCount}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-muted-foreground">{t(CHECK_INS, lang)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-2xl font-bold">{pinCount}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-muted-foreground">{t(PINS, lang)}</p></CardContent>
        </Card>
      </div>
    </div>
  );
}
