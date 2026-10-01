"use client";

import { use, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionNav, type NavSection } from "@/components/section-nav";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { isHeavyRainfall } from "@/lib/weather-thresholds";
import { useWeatherData } from "@/lib/use-weather-data";
import { describeRiver } from "@/lib/river-forecast";
import { ConfirmCentrePanel } from "@/features/evacuation/candidate-sites";
import { FloodPlanLink } from "@/features/evacuation/flood-plan";
import { useHazardsForZone, useSetCenterStatus, useZones } from "@/lib/reference-data/use-reference-data";
import { HAZARD_LEVEL_LABEL } from "@/lib/hazards";
import { useActiveAlertForZone, useSetZoneAlert } from "@/lib/alerts-store";
import { useManagesZone, useOfficial } from "@/lib/auth/official-context";
import { OfficialInbox } from "@/features/admin/official-inbox";
import { OfficialMessagesPanel } from "@/features/admin/official-messages-panel";
import { hasRealEvacuationCenter, hasRealHotline, hotlinesOf } from "@/lib/zone-data-quality";
import { telHref } from "@/lib/barangay-details";
import { SEVERITY_ORDER, SEVERITY_LABEL, SEVERITY_HEX, type Severity } from "@/lib/severity";
import { CENTER_STATUS_LABEL, CENTER_STATUS_ORDER, resolveEffectiveCenterStatus } from "@/lib/center-status";
import { SeverityBadge } from "@/features/alerts/severity-badge";
import { TrendChart } from "@/features/admin/charts/trend-chart";
import { RecentReportsPanel } from "@/features/water-level-report/recent-reports-panel";
import { CommunityPinModerationPanel } from "@/features/admin/community-pin-moderation-panel";
import { CheckInSummaryPanel } from "@/features/admin/check-in-summary-panel";
import { BarangayDetailsForm } from "@/features/admin/barangay-details-form";
import { LastChangeLine } from "@/features/admin/last-change-line";
import type { CenterStatus, LocalizedText } from "@/lib/types";

const BACK_TO_DASHBOARD: LocalizedText = { en: "Back to dashboard", fil: "Balik sa dashboard" };
const MANAGE_ZONE: LocalizedText = { en: "Manage zone", fil: "Pamahalaan ang zone" };
const ALERT_STATUS: LocalizedText = { en: "Alert status", fil: "Katayuan ng Alerto" };
const CLEAR_NO_ALERT: LocalizedText = { en: "Clear — no alert", fil: "Ligtas — walang alerto" };
const CURRENT_STATUS: LocalizedText = { en: "Current status", fil: "Kasalukuyang katayuan" };
const CLEAR: LocalizedText = { en: "Clear", fil: "Ligtas" };
const CAPACITY: LocalizedText = { en: "Evacuation center capacity", fil: "Kapasidad ng evacuation center" };
const RAINFALL: LocalizedText = { en: "Current rainfall", fil: "Kasalukuyang Ulan" };
const RAINFALL_TREND: LocalizedText = { en: "Rainfall — last 12 hours", fil: "Ulan — huling 12 oras" };
const RIVER_OUTLOOK: LocalizedText = { en: "River, next 7 days", fil: "Ilog, susunod na 7 araw" };
const NO_CENTRE: LocalizedText = {
  en: "No verified evacuation centre yet",
  fil: "Wala pang beripikadong evacuation center",
};
const NO_HOTLINE: LocalizedText = { en: "No verified hotline", fil: "Walang beripikadong hotline" };
const NO_READING: LocalizedText = { en: "No live weather reading right now", fil: "Walang live na ulat ng panahon ngayon" };
const FLOOD_SUSCEPTIBILITY: LocalizedText = { en: "Flood susceptibility", fil: "Panganib ng Baha" };
const LANDSLIDE_SUSCEPTIBILITY: LocalizedText = { en: "Landslide susceptibility", fil: "Panganib ng Guho" };
const NOTE: LocalizedText = {
  en: "Changes here are visible everywhere in the app immediately — the homepage map, the zone list, and the admin dashboard.",
  fil: "Ang mga pagbabago dito ay makikita agad sa buong app — sa homepage map, listahan ng mga zone, at admin dashboard.",
};
const SAVE_FAILED: LocalizedText = { en: "Could not save — try again.", fil: "Hindi na-save — subukan ulit." };
const HEADCOUNT_HINT: LocalizedText = {
  en: "Entering a headcount derives the status automatically instead of picking it manually",
  fil: "Ang paglagay ng bilang ay awtomatikong magtatakda ng status sa halip na piliin nang manu-mano",
};
const VIEW_ONLY_NOTE: LocalizedText = {
  en: "View only — this barangay is outside your area",
  fil: "Tingnan lang — wala sa saklaw mo ang barangay na ito",
};

// The section menu (SectionNav): each label names the section it jumps to.
const NAV_INBOX: LocalizedText = { en: "Needs your attention", fil: "Kailangan ng iyong pansin" };
const NAV_UPDATES: LocalizedText = { en: "Updates", fil: "Mga update" };
const NAV_CENTRE: LocalizedText = { en: "Evacuation centre", fil: "Evacuation center" };
const NAV_WEATHER: LocalizedText = { en: "Weather and hazards", fil: "Panahon at panganib" };
const NAV_SET_CENTRE: LocalizedText = { en: "Set your evacuation centre", fil: "Itakda ang evacuation center" };
const NAV_REPORTS: LocalizedText = { en: "What neighbours are reporting", fil: "Ang iniuulat ng mga kapitbahay" };
const NAV_CHECK_INS: LocalizedText = { en: "Resident check-ins", fil: "Check-in ng mga residente" };
const NAV_PINS: LocalizedText = { en: "Community pins", fil: "Mga community pin" };
/** Room above a section the menu jumps to, so the phone's sticky menu does not cover its title. */
const ANCHOR = "scroll-mt-20 lg:scroll-mt-6";

const EDIT_DETAILS: LocalizedText = { en: "Edit barangay details", fil: "I-edit ang detalye ng barangay" };

const ALERT_SEVERITY_VALUES: (Severity | "none")[] = ["none", ...SEVERITY_ORDER];

export default function ZoneDashboardPage({ params }: PageProps<"/admin/zone/[zoneId]">) {
  const { zoneId } = use(params);
  const { lang } = useLanguage();
  const zones = useZones();
  const susceptibility = useHazardsForZone(zoneId);
  const alert = useActiveAlertForZone(zoneId);
  const setZoneAlert = useSetZoneAlert();
  const setCenterStatus = useSetCenterStatus();
  const [alertError, setAlertError] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const managesZone = useManagesZone();
  const official = useOfficial();
  const { rainfallHistory, river } = useWeatherData(zoneId);

  const foundZone = zones.find((z) => z.id === zoneId);
  if (!foundZone) notFound();
  // Reassigned to a variable TypeScript can narrow inside the closures below:
  // it does not carry the `if (!foundZone)` narrowing across a nested
  // function's own scope, even though `zone` is a const that cannot change.
  const zone = foundZone;
  const canManage = managesZone(zone);
  // A barangay official is sent here from /admin, so this page is their home:
  // it carries the inbox, and a link "back" to /admin would only loop here.
  const isOwnHome = official.level === "barangay" && canManage;

  // Reflects the live headcount carried through reference data as
  // zone.currentOccupancy, same as every other read-only surface; falls back
  // to the zone's own centerStatus if no headcount has ever been recorded.
  const centerStatus = resolveEffectiveCenterStatus(zone.centerStatus, zone.evacuationCenterCapacity, zone.currentOccupancy);
  const isTrackingHeadcount = zone.currentOccupancy !== undefined;
  const rainfall = rainfallHistory[rainfallHistory.length - 1] ?? 0;

  // The alert write goes through the alerts store (useSetZoneAlert), which
  // refreshes the alert list once the database confirms it — see C1 there.
  async function handleAlertChange(value: Severity | "none") {
    setAlertError(false);
    const result = await setZoneAlert({ zoneId: zone.id, severity: value });
    if (!result.ok) setAlertError(true);
  }

  // The status write goes through useSetCenterStatus, which patches the
  // zone's centerStatus in ReferenceDataProvider's state once the database
  // confirms it — see R1 there.
  async function handleStatusChange(value: CenterStatus) {
    setStatusError(false);
    const result = await setCenterStatus({ zoneId: zone.id, status: value });
    if (!result.ok) setStatusError(true);
  }

  const sections: NavSection[] = [
    ...(isOwnHome
      ? [
          { id: "section-inbox", label: NAV_INBOX },
          { id: "section-updates", label: NAV_UPDATES },
        ]
      : []),
    { id: "section-alert", label: ALERT_STATUS },
    { id: "section-centre", label: NAV_CENTRE },
    { id: "section-weather", label: NAV_WEATHER },
    ...(canManage ? [{ id: "section-set-centre", label: NAV_SET_CENTRE }] : []),
    { id: "section-reports", label: NAV_REPORTS },
    { id: "section-check-ins", label: NAV_CHECK_INS },
    { id: "section-pins", label: NAV_PINS },
  ];

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-center lg:gap-8 lg:p-8">
      <SectionNav sections={sections} />
      <div className="w-full max-w-2xl space-y-6">
        {!isOwnHome && (
          <Button asChild variant="ghost" size="lg">
            <Link href="/admin">
              <ArrowLeft aria-hidden="true" />
              {t(BACK_TO_DASHBOARD, lang)}
            </Link>
          </Button>
        )}

        <div>
          <p className="text-sm text-muted-foreground">{t(MANAGE_ZONE, lang)}</p>
          <h1 className="text-2xl font-bold">{zone.name}</h1>
          {!canManage && (
            <p className="text-sm font-medium text-severity-orange">{t(VIEW_ONLY_NOTE, lang)}</p>
          )}
        </div>

        {isOwnHome && (
          <div id="section-inbox" className={ANCHOR}>
            <OfficialInbox zones={[zone]} />
          </div>
        )}
        {isOwnHome && (
          <div id="section-updates" className={ANCHOR}>
            <OfficialMessagesPanel />
          </div>
        )}

        <Card id="section-alert" className={ANCHOR}>
          <CardHeader>
            <CardTitle>{t(ALERT_STATUS, lang)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{t(CURRENT_STATUS, lang)}</span>
              {alert ? (
                <SeverityBadge severity={alert.severity} />
              ) : (
                <span className="text-sm font-medium text-green-500">{t(CLEAR, lang)}</span>
              )}
            </div>

            <LastChangeLine zoneId={zone.id} />

            {canManage && (
              <div className="space-y-2">
                <label htmlFor="alert-override-select" className="text-sm font-medium">
                  {t(ALERT_STATUS, lang)}
                </label>
                <Select
                  value={alert?.severity ?? "none"}
                  onValueChange={(value) => void handleAlertChange(value as Severity | "none")}
                >
                  <SelectTrigger id="alert-override-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALERT_SEVERITY_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === "none" ? t(CLEAR_NO_ALERT, lang) : t(SEVERITY_LABEL[value], lang)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {alertError && <p className="text-xs text-severity-red">{t(SAVE_FAILED, lang)}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card id="section-centre" className={ANCHOR}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 aria-hidden="true" className="h-5 w-5" />
              {hasRealEvacuationCenter(zone) ? zone.evacuationCenterName : t(NO_CENTRE, lang)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasRealHotline(zone) ? (
              <div className="space-y-1">
                {hotlinesOf(zone).map((number, i) => (
                  <a
                    key={`${number}-${i}`}
                    href={telHref(number)}
                    className="flex items-center gap-2 text-sm text-muted-foreground underline-offset-2 hover:underline"
                  >
                    <Phone aria-hidden="true" className="h-4 w-4" />
                    {number}
                  </a>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone aria-hidden="true" className="h-4 w-4" />
                {t(NO_HOTLINE, lang)}
              </p>
            )}

            {canManage &&
              (editingDetails ? (
                <BarangayDetailsForm zone={zone} onClose={() => setEditingDetails(false)} />
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingDetails(true)}>
                  <span lang={lang}>{t(EDIT_DETAILS, lang)}</span>
                </Button>
              ))}

            {canManage && (
              <div className="space-y-2">
                <label htmlFor="capacity-select" className="text-sm font-medium">
                  {t(CAPACITY, lang)}
                </label>
                <Select
                  value={centerStatus}
                  disabled={isTrackingHeadcount}
                  onValueChange={(value) => void handleStatusChange(value as CenterStatus)}
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
                {statusError && <p className="text-xs text-severity-red">{t(SAVE_FAILED, lang)}</p>}
                {isTrackingHeadcount && <p className="text-xs text-muted-foreground">{t(HEADCOUNT_HINT, lang)}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card id="section-weather" className={ANCHOR}>
          <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">{t(RAINFALL, lang)}</p>
              <p className="text-lg font-semibold">{rainfall} mm/hr</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t(FLOOD_SUSCEPTIBILITY, lang)}</p>
              <p className="text-lg font-semibold">{t(HAZARD_LEVEL_LABEL[susceptibility.flood], lang)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t(LANDSLIDE_SUSCEPTIBILITY, lang)}</p>
              <p className="text-lg font-semibold">{t(HAZARD_LEVEL_LABEL[susceptibility.landslide], lang)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t(RAINFALL_TREND, lang)}</CardTitle>
          </CardHeader>
          <CardContent>
            {rainfallHistory.length > 0 ? (
              <TrendChart
                series={rainfallHistory}
                color={isHeavyRainfall(rainfall) ? SEVERITY_HEX.orange : SEVERITY_HEX.yellow}
                label={`${zone.name} rainfall, last 12 hours`}
                unit="mm/hr"
                height={72}
              />
            ) : (
              <p lang={lang} className="text-sm text-muted-foreground">
                {t(NO_READING, lang)}
              </p>
            )}
            {river && (
              <div lang={lang} className="mt-3 space-y-1 border-t pt-3 text-sm">
                <p className="text-muted-foreground">{t(RIVER_OUTLOOK, lang)}</p>
                <p className={river.trend === "rising" ? "font-medium text-severity-orange" : "font-medium"}>
                  {describeRiver(river, lang)}
                </p>
                {river.trend === "rising" && (
                  <p className="text-xs text-muted-foreground">
                    {lang === "fil" ? `Pinakamasamang posibilidad: ${river.worstM3s} m³/s` : `Worst case ${river.worstM3s} m³/s`}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {canManage && (
          <div id="section-set-centre" className={ANCHOR}>
            <ConfirmCentrePanel zone={zone} />
          </div>
        )}
        {canManage && <FloodPlanLink zoneId={zone.id} />}

        <div id="section-reports" className={ANCHOR}>
          <RecentReportsPanel zone={zone} />
        </div>

        <div id="section-check-ins" className={ANCHOR}>
          <CheckInSummaryPanel zoneId={zone.id} />
        </div>

        <div id="section-pins" className={ANCHOR}>
          <CommunityPinModerationPanel zones={zones} zoneId={zone.id} />
        </div>

        <p className="text-xs text-muted-foreground">{t(NOTE, lang)}</p>
      </div>
    </main>
  );
}
