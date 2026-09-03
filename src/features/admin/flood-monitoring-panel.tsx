"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Droplet, Users, Settings2 } from "lucide-react";
import { SeverityBadge } from "@/features/alerts/severity-badge";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import {
  getHazardSusceptibilityForZone,
  getReportsTodayForZone,
  getRecentReportsForZone,
  REPORT_THRESHOLD,
} from "@/lib/mock-data";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { useZoneOverrides, resolveEffectiveAlert } from "@/lib/zone-overrides";
import { DEPTH_LABEL } from "@/lib/depth";
import type { HazardRiskLevel, LocalizedText, Zone } from "@/lib/types";

const TITLE: LocalizedText = { en: "Flood Monitoring", fil: "Pagsubaybay sa Baha" };
const SUBTITLE: LocalizedText = {
  en: "Live status, baseline susceptibility, and what residents are reporting right now",
  fil: "Live na katayuan, panganib, at kung ano ang iniuulat ng mga residente ngayon",
};
const CLEAR: LocalizedText = { en: "Clear", fil: "Ligtas" };
const REPORTS_TODAY: LocalizedText = { en: "reports today", fil: "ulat ngayon" };
const LATEST_REPORT: LocalizedText = { en: "Latest report", fil: "Pinakabagong ulat" };
const NO_REPORTS: LocalizedText = { en: "No reports yet", fil: "Wala pang ulat" };
const THRESHOLD_MET: LocalizedText = { en: "Report threshold met", fil: "Naabot ang threshold" };
const BELOW_THRESHOLD: LocalizedText = { en: "Below threshold", fil: "Wala pa sa threshold" };
const MANAGE: LocalizedText = { en: "Manage", fil: "Pamahalaan" };
const MINUTES_AGO: LocalizedText = { en: "min ago", fil: "min ang nakaraan" };

const SUSCEPTIBILITY_LABEL: Record<HazardRiskLevel, LocalizedText> = {
  low: { en: "Low susceptibility", fil: "Mababang panganib" },
  medium: { en: "Medium susceptibility", fil: "Katamtamang panganib" },
  high: { en: "High susceptibility", fil: "Mataas na panganib" },
};

export function FloodMonitoringPanel({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const overrides = useZoneOverrides();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Droplet aria-hidden="true" className="h-5 w-5" />
          {t(TITLE, lang)}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t(SUBTITLE, lang)}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {zones.map((zone) => {
          const alert = resolveEffectiveAlert(zone.id, overrides[zone.id]?.alertSeverity);
          const status = getZoneStatus(alert);
          const statusColor = getZoneStatusColor(alert);
          const susceptibility = getHazardSusceptibilityForZone(zone.id).flood;
          const reportsToday = getReportsTodayForZone(zone.id);
          const recent = getRecentReportsForZone(zone.id);
          const agreeing = recent.filter((report) => !report.isOutlier).length;

          return (
            <div
              key={zone.id}
              className="space-y-2 rounded-md border-2 border-border p-3"
              style={{ borderLeftColor: statusColor, borderLeftWidth: 6 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{zone.name}</p>
                  <p className="text-xs" style={{ color: statusColor }}>
                    {t(ZONE_STATUS_LABEL[status], lang)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {alert ? (
                    <SeverityBadge severity={alert.severity} />
                  ) : (
                    <span className="text-sm text-green-500">{t(CLEAR, lang)}</span>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/zone/${zone.id}`}>
                      <Settings2 aria-hidden="true" className="h-4 w-4" />
                      {t(MANAGE, lang)}
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline">{t(SUSCEPTIBILITY_LABEL[susceptibility], lang)}</Badge>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Users aria-hidden="true" className="h-3.5 w-3.5" />
                  {reportsToday} {t(REPORTS_TODAY, lang)}
                </span>
                <Badge
                  className={
                    agreeing >= REPORT_THRESHOLD
                      ? "bg-severity-orange text-black"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {t(agreeing >= REPORT_THRESHOLD ? THRESHOLD_MET : BELOW_THRESHOLD, lang)} ({agreeing}/
                  {REPORT_THRESHOLD})
                </Badge>
              </div>

              <p className="text-xs text-muted-foreground">
                {recent.length > 0 ? (
                  <>
                    {t(LATEST_REPORT, lang)}: {t(DEPTH_LABEL[recent[0].depthLevel], lang)} ·{" "}
                    {recent[0].minutesAgo} {t(MINUTES_AGO, lang)}
                  </>
                ) : (
                  t(NO_REPORTS, lang)
                )}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
