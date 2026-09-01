"use client";

import { Building2, Navigation, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { Zone } from "@/lib/types";

export function EvacuationInstructions({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();

  return (
    <Card className="w-full max-w-md">
      <CardContent className="space-y-6 pt-6">
        <div className="flex items-start gap-4">
          <Building2
            data-testid="icon-evacuation-center"
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <div>
            <p className="text-sm text-muted-foreground">Go here</p>
            <p className="text-lg font-semibold">{zone.evacuationCenterName}</p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <Navigation
            data-testid="icon-route"
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <div>
            <p className="text-sm text-muted-foreground">How to get there</p>
            <p lang={lang} className="text-base">
              {t(zone.evacuationRouteText, lang)}
            </p>
          </div>
        </div>

        <a
          href={`tel:${zone.hotlineNumber}`}
          className="flex items-center gap-4 rounded-md border-2 border-severity-red p-3"
        >
          <Phone
            data-testid="icon-hotline"
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <span className="text-base font-medium">Call {zone.hotlineNumber}</span>
        </a>
      </CardContent>
    </Card>
  );
}
