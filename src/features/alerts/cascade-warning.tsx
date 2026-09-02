"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { CascadeAlert, LocalizedText, Zone } from "@/lib/types";

const CASCADE_ALERT_FROM: LocalizedText = { en: "Cascade alert from", fil: "Babala mula sa" };
const IMPACT_TO: LocalizedText = { en: "to", fil: "papunta sa" };

export function CascadeWarning({
  cascade,
  fromZone,
  toZone,
}: {
  cascade: CascadeAlert;
  fromZone: Zone;
  toZone: Zone;
}) {
  const { lang } = useLanguage();

  return (
    <Card className="w-full max-w-md border-severity-orange/50 bg-severity-orange/5">
      <CardContent className="flex items-start gap-3 pt-6">
        <AlertTriangle
          aria-hidden="true"
          className="h-6 w-6 shrink-0 text-severity-orange"
        />
        <div className="space-y-1">
          <p className="text-sm font-medium text-severity-orange">
            {t(CASCADE_ALERT_FROM, lang)} {fromZone.name}
          </p>
          <p lang={lang} className="text-base">
            {t(cascade.message, lang)}
          </p>
          <p className="text-xs text-muted-foreground">
            ⏱ {cascade.estimatedImpactHours}h {t(IMPACT_TO, lang)} {toZone.name}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
