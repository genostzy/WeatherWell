"use client";

import { Card, CardContent } from "@/components/ui/card";
import { SeverityBadge } from "@/features/alerts/severity-badge";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getActiveAlertForZone } from "@/lib/mock-data";
import type { LocalizedText, Zone } from "@/lib/types";

const NO_CONNECTION_NOTE: LocalizedText = {
  en: "No internet connection — showing the last known alert status for each zone instead of the map.",
  fil: "Walang internet connection — ipinapakita ang huling kilalang alert status ng bawat zone sa halip na ang mapa.",
};

const CLEAR_NO_ALERT: LocalizedText = { en: "Clear — no active alert", fil: "Ligtas" };

export function ZoneAlertListFallback({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();

  return (
    <div className="w-full max-w-md space-y-3 md:max-w-lg lg:max-w-xl">
      <p lang={lang} className="text-sm text-muted-foreground">
        {t(NO_CONNECTION_NOTE, lang)}
      </p>
      {zones.map((zone) => {
        const alert = getActiveAlertForZone(zone.id);
        return (
          <Card key={zone.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <span className="font-medium">{zone.name}</span>
              {alert ? (
                <SeverityBadge severity={alert.severity} />
              ) : (
                <span className="text-sm text-green-500">{t(CLEAR_NO_ALERT, lang)}</span>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
