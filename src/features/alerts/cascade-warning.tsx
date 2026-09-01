"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { CascadeAlert, Zone } from "@/lib/types";

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
    <Card className="w-full max-w-md border-orange-500/50 bg-orange-500/5">
      <CardContent className="flex items-start gap-3 pt-6">
        <AlertTriangle
          aria-hidden="true"
          className="h-6 w-6 shrink-0 text-orange-500"
        />
        <div className="space-y-1">
          <p className="text-sm font-medium text-orange-500">
            {lang === "fil" ? "Babala mula sa" : "Cascade alert from"} {fromZone.name}
          </p>
          <p lang={lang} className="text-base">
            {t(cascade.message, lang)}
          </p>
          <p className="text-xs text-muted-foreground">
            ⏱ {cascade.estimatedImpactHours}h {lang === "fil" ? "papunta sa" : "to"} {toZone.name}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
