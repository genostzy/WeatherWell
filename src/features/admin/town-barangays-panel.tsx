"use client";

import Link from "next/link";
import { Building2, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityBadge } from "@/features/alerts/severity-badge";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useAlerts } from "@/lib/alerts-store";
import { useWaterLevelReports } from "@/lib/water-level-reports";
import { countsTowardAlert } from "@/lib/weather-thresholds";
import { useHazards } from "@/lib/reference-data/use-reference-data";
import { HAZARD_LEVEL_LABEL } from "@/lib/hazards";
import { CENTER_STATUS_CLASS, CENTER_STATUS_LABEL, resolveEffectiveCenterStatus } from "@/lib/center-status";
import { hasRealEvacuationCenter } from "@/lib/zone-data-quality";
import { SEVERITY_ORDER } from "@/lib/severity";
import type { LocalizedText, Zone } from "@/lib/types";

/** One row of town_officials(): a barangay official in the caller's town. */
export interface TownOfficial {
  userId: string;
  displayName: string;
  areaCode: string;
}

const TITLE: LocalizedText = { en: "Barangays", fil: "Mga barangay" };
const NO_ALERT: LocalizedText = { en: "No alert", fil: "Walang alerto" };
const NO_OFFICIAL: LocalizedText = { en: "No barangay official", fil: "Walang opisyal ng barangay" };
const NO_CENTRE: LocalizedText = { en: "No verified centre", fil: "Walang beripikadong center" };
const REPORTS: LocalizedText = { en: "{n} reports (6 h)", fil: "{n} ulat (6 oras)" };
const FLOOD_RISK: LocalizedText = { en: "Flood risk: {level}", fil: "Panganib ng baha: {level}" };
const MANAGE: LocalizedText = { en: "Manage", fil: "Pamahalaan" };
const MISSING: LocalizedText = {
  en: "{n} of {total} barangays have no official yet — appoint them under Barangay officials.",
  fil: "{n} sa {total} barangay ang wala pang opisyal — itakda sa Mga opisyal ng barangay.",
};

/**
 * A municipal official's barangays at a glance: which are under alert (first),
 * whose centre is filling, and which have nobody appointed to act on them.
 * Each row also carries the barangay's recent agreeing reports.
 */
export function TownBarangaysPanel({ zones, officials }: { zones: Zone[]; officials: TownOfficial[] }) {
  const { lang } = useLanguage();
  const alerts = useAlerts();
  const reports = useWaterLevelReports();
  const hazards = useHazards();
  // The flood panel used to list every barangay again just for this count.
  const reportsIn = (zoneId: string) => reports.filter((r) => r.zoneId === zoneId && countsTowardAlert(r)).length;
  const alertFor = (zoneId: string) => alerts.find((a) => a.zoneId === zoneId && a.isActive);
  const officialFor = (zone: Zone) => officials.find((o) => o.areaCode === zone.psgcBarangayCode);
  const rank = (zone: Zone) => {
    const alert = alertFor(zone.id);
    return alert ? SEVERITY_ORDER.indexOf(alert.severity) + 1 : 0;
  };
  const sorted = zones.slice().sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
  const missing = zones.filter((z) => !officialFor(z)).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 aria-hidden="true" className="h-5 w-5" />
          <span lang={lang}>{t(TITLE, lang)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {missing > 0 && (
          <p lang={lang} className="text-sm text-muted-foreground">
            {t(MISSING, lang).replace("{n}", String(missing)).replace("{total}", String(zones.length))}
          </p>
        )}
        <ul className="divide-y divide-border rounded-md border-2 border-border">
          {sorted.map((zone) => {
            const alert = alertFor(zone.id);
            const official = officialFor(zone);
            const centre = resolveEffectiveCenterStatus(zone.centerStatus, zone.evacuationCenterCapacity, zone.currentOccupancy);
            return (
              <li key={zone.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium">{zone.name}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {alert ? (
                      <SeverityBadge severity={alert.severity} />
                    ) : (
                      <span lang={lang} className="text-muted-foreground">
                        {t(NO_ALERT, lang)}
                      </span>
                    )}
                    {reportsIn(zone.id) > 0 && (
                      <span lang={lang} className="font-medium text-severity-orange">
                        {t(REPORTS, lang).replace("{n}", String(reportsIn(zone.id)))}
                      </span>
                    )}
                    {hazards[zone.id]?.flood && hazards[zone.id]?.flood !== "unknown" && (
                      <span lang={lang}>
                        {t(FLOOD_RISK, lang).replace("{level}", t(HAZARD_LEVEL_LABEL[hazards[zone.id]!.flood!], lang).toLowerCase())}
                      </span>
                    )}
                    {hasRealEvacuationCenter(zone) ? (
                      <span lang={lang} className={`rounded px-1.5 py-0.5 ${CENTER_STATUS_CLASS[centre]}`}>
                        {t(CENTER_STATUS_LABEL[centre], lang)}
                      </span>
                    ) : (
                      <span lang={lang} className="text-muted-foreground">
                        {t(NO_CENTRE, lang)}
                      </span>
                    )}
                    {official ? (
                      <span className="flex items-center gap-1">
                        <UserCheck aria-hidden="true" className="h-3.5 w-3.5 text-green-500" />
                        {official.displayName}
                      </span>
                    ) : (
                      <span lang={lang} className="flex items-center gap-1 text-severity-orange">
                        <UserX aria-hidden="true" className="h-3.5 w-3.5" />
                        {t(NO_OFFICIAL, lang)}
                      </span>
                    )}
                  </div>
                </div>
                <Button asChild variant="outline" className="h-10">
                  <Link href={`/admin/zone/${zone.id}`}>
                    <span lang={lang}>{t(MANAGE, lang)}</span>
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
