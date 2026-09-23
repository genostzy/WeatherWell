"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { hasRealEvacuationCenter, hasRealHotline, NO_VERIFIED_CENTER } from "@/lib/zone-data-quality";
import type { LocalizedText, Zone } from "@/lib/types";

const EMERGENCY_CARD: LocalizedText = { en: "Emergency Card", fil: "Emergency Card" };
const ZONE_LABEL: LocalizedText = { en: "Zone", fil: "Zone" };
const EVACUATION_CENTER: LocalizedText = { en: "Evacuation Center", fil: "Evacuation Center" };
const HOW_TO_GET_THERE: LocalizedText = { en: "How to Get There", fil: "Paano Makarating" };
const EMERGENCY_HOTLINE: LocalizedText = { en: "Emergency Hotline", fil: "Emergency Hotline" };
const QR_ALT: LocalizedText = { en: "QR code to open WeatherWell", fil: "QR code para buksan ang WeatherWell" };
const PRINT_CARD: LocalizedText = { en: "Print this card", fil: "I-print ang card na ito" };
const NO_HOTLINE: LocalizedText = {
  en: "Ask your barangay hall for the hotline and write it here",
  fil: "Itanong sa barangay hall ang hotline at isulat dito",
};
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
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(window.location.origin + "/", { errorCorrectionLevel: "M", margin: 1, width: 192 })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
            {hasRealEvacuationCenter(zone) ? (
              <p className="font-semibold">{zone.evacuationCenterName}</p>
            ) : (
              <p lang={lang} className="font-semibold">
                {t(NO_VERIFIED_CENTER, lang)}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs text-muted-foreground">{t(HOW_TO_GET_THERE, lang)}</p>
            <p lang={lang} className="text-sm">
              {t(zone.evacuationRouteText, lang)}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">{t(EMERGENCY_HOTLINE, lang)}</p>
            {hasRealHotline(zone) ? (
              <p className="font-bold text-severity-red">{zone.hotlineNumber}</p>
            ) : (
              <p lang={lang} className="text-sm">
                {t(NO_HOTLINE, lang)}: ______________
              </p>
            )}
          </div>
        </div>

        <div className="border-t pt-3 text-center">
          <p className="text-xs text-muted-foreground">{t(SCAN_TO_INSTALL, lang)}</p>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element -- a data: URL generated on the device; next/image adds nothing here
            <img src={qr} alt={t(QR_ALT, lang)} width={96} height={96} className="mx-auto mt-2 h-24 w-24" />
          )}
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          {t(PRINT_AND_LAMINATE, lang)}
        </p>

        <Button type="button" size="lg" variant="outline" className="w-full print:hidden" onClick={() => window.print()}>
          <Printer aria-hidden="true" className="h-4 w-4" />
          {t(PRINT_CARD, lang)}
        </Button>
      </CardContent>
    </Card>
  );
}
