"use client";

import { MapPin, Building2, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { SEVERITY_HEX } from "@/lib/severity";
import { getActiveAlertForZone } from "@/lib/mock-data";
import type { Zone } from "@/lib/types";

export function ZoneMap({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();

  return (
    <div className="grid w-full max-w-md gap-3">
      {zones.map((zone) => {
        const alert = getActiveAlertForZone(zone.id);
        return (
          <Card
            key={zone.id}
            data-testid="zone-region"
            className="overflow-hidden"
          >
            <div
              className="h-2"
              style={{
                backgroundColor: alert
                  ? SEVERITY_HEX[alert.severity]
                  : "hsl(var(--muted))",
              }}
            />
            <CardContent className="flex items-start gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <MapPin aria-hidden="true" className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="font-medium">{zone.name}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 aria-hidden="true" className="h-4 w-4" />
                  <span>{zone.evacuationCenterName}</span>
                </div>
                {alert && (
                  <div className="flex items-center gap-2">
                    <Badge
                      style={{
                        backgroundColor: SEVERITY_HEX[alert.severity],
                        color: alert.severity === "red" || alert.severity === "evacuate" ? "white" : "black",
                      }}
                    >
                      {alert.severity.toUpperCase()}
                    </Badge>
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    <span className="text-sm">{zone.evacuationCenterName}</span>
                  </div>
                )}
                {!alert && (
                  <p className="text-sm text-green-500">
                    {lang === "fil" ? "Ligtas" : "Clear — no active alert"}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      <p className="text-xs text-muted-foreground">
        {lang === "fil"
          ? "Placeholder — ang totoong boundary data ay darating sa Phase 2"
          : "Placeholder — real barangay boundary data lands in Phase 2"}
      </p>
    </div>
  );
}
