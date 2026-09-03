"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import {
  MOCK_ZONES,
  getRainfallForZone,
  getRainfallHistoryForZone,
  getHazardSusceptibilityForZone,
  isHeavyRainfall,
} from "@/lib/mock-data";
import { SEVERITY_ORDER, SEVERITY_LABEL, SEVERITY_HEX, type Severity } from "@/lib/severity";
import { CENTER_STATUS_LABEL, CENTER_STATUS_ORDER } from "@/lib/center-status";
import {
  useZoneOverrides,
  resolveEffectiveAlert,
  resolveEffectiveCenterStatus,
  setZoneAlertOverride,
  setZoneCenterStatusOverride,
  type AlertOverrideValue,
} from "@/lib/zone-overrides";
import { SeverityBadge } from "@/features/alerts/severity-badge";
import { TrendChart } from "@/features/admin/charts/trend-chart";
import { RecentReportsPanel } from "@/features/water-level-report/recent-reports-panel";
import { CommunityPinModerationPanel } from "@/features/admin/community-pin-moderation-panel";
import type { CenterStatus, LocalizedText } from "@/lib/types";

const BACK_TO_DASHBOARD: LocalizedText = { en: "Back to admin dashboard", fil: "Balik sa admin dashboard" };
const MANAGE_ZONE: LocalizedText = { en: "Manage zone", fil: "Pamahalaan ang zone" };
const ALERT_STATUS: LocalizedText = { en: "Alert status", fil: "Katayuan ng Alerto" };
const AUTOMATIC: LocalizedText = { en: "Automatic (from reports)", fil: "Awtomatiko (mula sa mga ulat)" };
const CLEAR_NO_ALERT: LocalizedText = { en: "Clear — no alert", fil: "Ligtas — walang alerto" };
const CURRENT_STATUS: LocalizedText = { en: "Current status", fil: "Kasalukuyang katayuan" };
const CLEAR: LocalizedText = { en: "Clear", fil: "Ligtas" };
const CAPACITY: LocalizedText = { en: "Evacuation center capacity", fil: "Kapasidad ng evacuation center" };
const RAINFALL: LocalizedText = { en: "Current rainfall", fil: "Kasalukuyang Ulan" };
const RAINFALL_TREND: LocalizedText = { en: "Rainfall — last 12 hours", fil: "Ulan — huling 12 oras" };
const FLOOD_SUSCEPTIBILITY: LocalizedText = { en: "Flood susceptibility", fil: "Panganib ng Baha" };
const LANDSLIDE_SUSCEPTIBILITY: LocalizedText = { en: "Landslide susceptibility", fil: "Panganib ng Guho" };
const NOTE: LocalizedText = {
  en: "Changes here are visible everywhere in the app immediately — the homepage map, the zone list, and the admin dashboard.",
  fil: "Ang mga pagbabago dito ay makikita agad sa buong app — sa homepage map, listahan ng mga zone, at admin dashboard.",
};

const ALERT_OVERRIDE_VALUES: (AlertOverrideValue | "auto")[] = ["auto", "none", ...SEVERITY_ORDER];

export default function ZoneDashboardPage({ params }: PageProps<"/admin/zone/[zoneId]">) {
  const { zoneId } = use(params);
  const { lang } = useLanguage();
  const overrides = useZoneOverrides();

  const zone = MOCK_ZONES.find((z) => z.id === zoneId);
  if (!zone) notFound();

  const alertOverride = overrides[zone.id]?.alertSeverity;
  const effectiveAlert = resolveEffectiveAlert(zone.id, alertOverride);
  const centerStatus = resolveEffectiveCenterStatus(
    zone.centerStatus,
    overrides[zone.id]?.centerStatus,
    zone.evacuationCenterCapacity,
    overrides[zone.id]?.currentOccupancy
  );
  const susceptibility = getHazardSusceptibilityForZone(zone.id);
  const rainfall = getRainfallForZone(zone.id);
  const rainfallHistory = getRainfallHistoryForZone(zone.id);

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-2xl space-y-6">
        <Button asChild variant="ghost" size="lg">
          <Link href="/admin">
            <ArrowLeft aria-hidden="true" />
            {t(BACK_TO_DASHBOARD, lang)}
          </Link>
        </Button>

        <div>
          <p className="text-sm text-muted-foreground">{t(MANAGE_ZONE, lang)}</p>
          <h1 className="text-2xl font-bold">{zone.name}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t(ALERT_STATUS, lang)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{t(CURRENT_STATUS, lang)}</span>
              {effectiveAlert ? (
                <SeverityBadge severity={effectiveAlert.severity} />
              ) : (
                <span className="text-sm font-medium text-green-500">{t(CLEAR, lang)}</span>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="alert-override-select" className="text-sm font-medium">
                {t(ALERT_STATUS, lang)}
              </label>
              <Select
                value={alertOverride ?? "auto"}
                onValueChange={(value) =>
                  setZoneAlertOverride(
                    zone.id,
                    value === "auto" ? undefined : (value as AlertOverrideValue)
                  )
                }
              >
                <SelectTrigger id="alert-override-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALERT_OVERRIDE_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "auto"
                        ? t(AUTOMATIC, lang)
                        : value === "none"
                        ? t(CLEAR_NO_ALERT, lang)
                        : t(SEVERITY_LABEL[value as Severity], lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 aria-hidden="true" className="h-5 w-5" />
              {zone.evacuationCenterName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <a
              href={`tel:${zone.hotlineNumber}`}
              className="flex items-center gap-2 text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              <Phone aria-hidden="true" className="h-4 w-4" />
              {zone.hotlineNumber}
            </a>

            <div className="space-y-2">
              <label htmlFor="capacity-select" className="text-sm font-medium">
                {t(CAPACITY, lang)}
              </label>
              <Select
                value={centerStatus}
                onValueChange={(value) => setZoneCenterStatusOverride(zone.id, value as CenterStatus)}
              >
                <SelectTrigger id="capacity-select">
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">{t(RAINFALL, lang)}</p>
              <p className="text-lg font-semibold">{rainfall} mm/hr</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t(FLOOD_SUSCEPTIBILITY, lang)}</p>
              <p className="text-lg font-semibold capitalize">{susceptibility.flood}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t(LANDSLIDE_SUSCEPTIBILITY, lang)}</p>
              <p className="text-lg font-semibold capitalize">{susceptibility.landslide}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t(RAINFALL_TREND, lang)}</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              series={rainfallHistory}
              color={isHeavyRainfall(rainfall) ? SEVERITY_HEX.orange : SEVERITY_HEX.yellow}
              label={`${zone.name} rainfall, last 12 hours`}
              unit="mm/hr"
              height={72}
            />
          </CardContent>
        </Card>

        <RecentReportsPanel zone={zone} />

        <CommunityPinModerationPanel zones={MOCK_ZONES} zoneId={zone.id} />

        <p className="text-xs text-muted-foreground">{t(NOTE, lang)}</p>
      </div>
    </main>
  );
}
