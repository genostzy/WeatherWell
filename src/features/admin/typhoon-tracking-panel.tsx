"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wind } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { MOCK_TYPHOON } from "@/lib/mock-data";
import type { LocalizedText } from "@/lib/types";

const TITLE: LocalizedText = { en: "Typhoon Tracking", fil: "Pagsubaybay sa Bagyo" };
const NO_ACTIVE_SYSTEM: LocalizedText = {
  en: "No active tropical cyclone.",
  fil: "Walang aktibong bagyo sa ngayon.",
};
const DISTANCE: LocalizedText = { en: "Distance", fil: "Layo" };
const ETA: LocalizedText = { en: "ETA", fil: "Tantyang Oras ng Pagdating" };
const HOURS: LocalizedText = { en: "hours", fil: "oras" };

export function TyphoonTrackingPanel() {
  const { lang } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wind aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {MOCK_TYPHOON ? (
          <div className="space-y-1">
            <p className="text-lg font-semibold">{MOCK_TYPHOON.name}</p>
            <p lang={lang} className="text-sm text-muted-foreground">
              {t(MOCK_TYPHOON.category, lang)}
            </p>
            <p className="text-sm">
              {t(DISTANCE, lang)}: {MOCK_TYPHOON.distanceKm}km {MOCK_TYPHOON.bearing}
            </p>
            <p className="text-sm">
              {t(ETA, lang)}: {MOCK_TYPHOON.etaHours} {t(HOURS, lang)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t(NO_ACTIVE_SYSTEM, lang)}</p>
        )}
      </CardContent>
    </Card>
  );
}
