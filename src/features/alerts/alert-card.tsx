"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "./severity-badge";
import { ShareAlertButton } from "./share-alert-button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { AlertRecord, LocalizedText, Zone } from "@/lib/types";

const NO_ACTIVE_ALERT: LocalizedText = {
  en: "No active alert for this zone.",
  fil: "Walang aktibong alerto para sa zone na ito.",
};

const CONFIDENCE_LABEL = {
  en: { estimated: "Estimated", validated: "Validated", calibrated: "Calibrated" },
  fil: { estimated: "Tantiya", validated: "Napatunayan", calibrated: "Na-calibrate" },
};

export function AlertCard({
  alert,
  zone,
}: {
  alert: AlertRecord | undefined;
  zone: Zone;
}) {
  const { lang } = useLanguage();

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>{zone.name}</CardTitle>
        {alert && <SeverityBadge severity={alert.severity} />}
      </CardHeader>
      <CardContent className="space-y-3">
        {alert ? (
          <>
            <p lang={lang} className="text-base">
              {t(alert.message, lang)}
            </p>
            {alert.predictedTiming && (
              <p lang={lang} className="text-sm text-muted-foreground">
                ⏱ {t(alert.predictedTiming, lang)}
              </p>
            )}
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs">
                {CONFIDENCE_LABEL[lang][alert.confidence]}
              </Badge>
              <ShareAlertButton alert={alert} zone={zone} />
            </div>
          </>
        ) : (
          <p lang={lang} className="text-muted-foreground">
            {t(NO_ACTIVE_ALERT, lang)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
