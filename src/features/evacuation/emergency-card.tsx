"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { Zone } from "@/lib/types";

export function EmergencyCard({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();

  return (
    <Card className="w-full max-w-md border-2 border-dashed print:border-solid print:border-black">
      <CardContent className="space-y-4 pt-6 print:pt-4">
        <div className="text-center">
          <h2 className="text-xl font-bold print:text-lg">WeatherWell</h2>
          <p className="text-sm text-muted-foreground">
            {lang === "fil" ? "Emergency Card" : "Emergency Card"}
          </p>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-xs text-muted-foreground">
              {lang === "fil" ? "Zone" : "Zone"}
            </p>
            <p className="font-semibold">{zone.name}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">
              {lang === "fil" ? "Evacuation Center" : "Evacuation Center"}
            </p>
            <p className="font-semibold">{zone.evacuationCenterName}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">
              {lang === "fil" ? "Paano Makarating" : "How to Get There"}
            </p>
            <p lang={lang} className="text-sm">
              {t(zone.evacuationRouteText, lang)}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">
              {lang === "fil" ? "Emergency Hotline" : "Emergency Hotline"}
            </p>
            <p className="font-bold text-severity-red">{zone.hotlineNumber}</p>
          </div>
        </div>

        <div className="border-t pt-3 text-center">
          <p className="text-xs text-muted-foreground">
            {lang === "fil"
              ? "I-scan ang QR code para i-install ang app"
              : "Scan QR code to install the app"}
          </p>
          <div className="mx-auto mt-2 flex h-24 w-24 items-center justify-center border">
            <span className="text-xs text-muted-foreground">QR Code</span>
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          {lang === "fil"
            ? "I-print at i-laminato para sa iyong bahay"
            : "Print and laminate for your household"}
        </p>
      </CardContent>
    </Card>
  );
}
