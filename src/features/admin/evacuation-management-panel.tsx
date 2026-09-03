"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Phone, Settings2 } from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { CENTER_STATUS_LABEL, CENTER_STATUS_ORDER } from "@/lib/center-status";
import { useZoneOverrides, resolveEffectiveCenterStatus, setZoneCenterStatusOverride } from "@/lib/zone-overrides";
import type { CenterStatus, LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Evacuation Management", fil: "Pamamahala ng Evacuation" };
const CAPACITY: LocalizedText = { en: "Capacity", fil: "Kapasidad" };
const MANAGE_ZONE: LocalizedText = { en: "Manage zone", fil: "Pamahalaan ang zone" };

export function EvacuationManagementPanel({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const overrides = useZoneOverrides();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {zones.map((zone) => {
          const centerStatus = resolveEffectiveCenterStatus(
            zone.centerStatus,
            overrides[zone.id]?.centerStatus
          );
          return (
            <div key={zone.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0">
              <div>
                <p className="font-medium">{zone.name}</p>
                <p className="text-sm text-muted-foreground">{zone.evacuationCenterName}</p>
                <a
                  href={`tel:${zone.hotlineNumber}`}
                  className="flex items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:underline"
                >
                  <Phone aria-hidden="true" className="h-3.5 w-3.5" />
                  {zone.hotlineNumber}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={centerStatus}
                  onValueChange={(value) => setZoneCenterStatusOverride(zone.id, value as CenterStatus)}
                >
                  <SelectTrigger aria-label={`${t(CAPACITY, lang)} — ${zone.name}`} className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CENTER_STATUS_ORDER.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(CENTER_STATUS_LABEL[status], lang)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/zone/${zone.id}`}>
                    <Settings2 aria-hidden="true" className="h-4 w-4" />
                    {t(MANAGE_ZONE, lang)}
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
