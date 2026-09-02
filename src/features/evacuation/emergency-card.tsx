"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText, Zone } from "@/lib/types";

const EMERGENCY_CARD: LocalizedText = { en: "Emergency Card", fil: "Emergency Card" };
const ZONE_LABEL: LocalizedText = { en: "Zone", fil: "Zone" };
const EVACUATION_CENTER: LocalizedText = { en: "Evacuation Center", fil: "Evacuation Center" };
const HOW_TO_GET_THERE: LocalizedText = { en: "How to Get There", fil: "Paano Makarating" };
const EMERGENCY_HOTLINE: LocalizedText = { en: "Emergency Hotline", fil: "Emergency Hotline" };
const SCAN_TO_INSTALL: LocalizedText = {
  en: "Scan QR code to install the app",
  fil: "I-scan ang QR code para i-install ang app",
};
const PRINT_AND_LAMINATE: LocalizedText = {
  en: "Print and laminate for your household",
  fil: "I-print at i-laminato para sa iyong bahay",
};

export function EmergencyCard({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();

  return (
    <Card className="w-full max-w-md border-2 border-dashed print:border-solid print:border-black">
      <CardContent className="space-y-4 pt-6 print:pt-4">
        <div className="text-center">
          <h2 className="text-xl font-bold print:text-lg">WeatherWell</h2>
          <p className="text-sm text-muted-foreground">{t(EMERGENCY_CARD, lang)}</p>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-xs text-muted-foreground">{t(ZONE_LABEL, lang)}</p>
            <p className="font-semibold">{zone.name}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">{t(EVACUATION_CENTER, lang)}</p>
            <p className="font-semibold">{zone.evacuationCenterName}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">{t(HOW_TO_GET_THERE, lang)}</p>
            <p lang={lang} className="text-sm">
              {t(zone.evacuationRouteText, lang)}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">{t(EMERGENCY_HOTLINE, lang)}</p>
            <p className="font-bold text-severity-red">{zone.hotlineNumber}</p>
          </div>
        </div>

        <div className="border-t pt-3 text-center">
          <p className="text-xs text-muted-foreground">{t(SCAN_TO_INSTALL, lang)}</p>
          <div className="mx-auto mt-2 flex h-24 w-24 items-center justify-center border">
            <span className="text-xs text-muted-foreground">QR Code</span>
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          {t(PRINT_AND_LAMINATE, lang)}
        </p>
      </CardContent>
    </Card>
  );
}
