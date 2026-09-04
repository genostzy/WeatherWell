"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  AlertTriangle,
  Building2,
  CloudRain,
  Map,
  MapPin,
  Play,
  Users,
  Wind,
} from "lucide-react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { StatCard } from "@/features/admin/stat-card";
import { FloodMonitoringPanel } from "@/features/admin/flood-monitoring-panel";
import { RainfallMonitoringPanel } from "@/features/admin/rainfall-monitoring-panel";
import { TyphoonTrackingPanel } from "@/features/admin/typhoon-tracking-panel";
import { LandslideRiskPanel } from "@/features/admin/landslide-risk-panel";
import { EvacuationManagementPanel } from "@/features/admin/evacuation-management-panel";
import { ReportTrendPanel } from "@/features/admin/report-trend-panel";
import { AlertAnalyticsPanel } from "@/features/admin/alert-analytics-panel";
import { CommunityPinModerationPanel } from "@/features/admin/community-pin-moderation-panel";
import {
  MOCK_ZONES,
  MOCK_TYPHOON,
  getRainfallForZone,
  getReportsTodayForZone,
  isHeavyRainfall,
} from "@/lib/mock-data";
import { useZoneOverrides, resolveEffectiveAlert, resolveEffectiveCenterStatus } from "@/lib/zone-overrides";
import { useCommunityPins } from "@/lib/community-pins";
import { getZoneStatus } from "@/lib/zone-status";
import { buildZoneInputForZone, computeZoneState } from "@/lib/risk-engine/score";
import type { LocalizedText } from "@/lib/types";

const SUBTITLE: LocalizedText = {
  en: "Live picture of every zone — hazards, crowd reports, and evacuation capacity",
  fil: "Live na larawan ng bawat zone — panganib, ulat, at kapasidad ng evacuation",
};
const AT_A_GLANCE: LocalizedText = { en: "At a glance", fil: "Sa isang sulyap" };
const HAZARDS: LocalizedText = { en: "Hazard monitoring", fil: "Pagsubaybay sa panganib" };
const ANALYTICS: LocalizedText = { en: "Trends & analytics", fil: "Mga trend at analytics" };
const OPERATIONS: LocalizedText = { en: "Operations", fil: "Operasyon" };
const OPEN_MAP: LocalizedText = { en: "Operations map", fil: "Mapa ng operasyon" };
const MAP_HINT: LocalizedText = {
  en: "See every zone at once — override an alert, log a headcount, or moderate a pin where it actually sits.",
  fil: "Tingnan ang lahat ng zone nang sabay — baguhin ang alerto, itala ang bilang, o pamahalaan ang pin kung saan ito naroon.",
};
const OPEN_MAP_ACTION: LocalizedText = { en: "Open map", fil: "Buksan ang mapa" };
const RUN_SIMULATION: LocalizedText = { en: "Run alert flow simulation", fil: "Patakbuhin ang alert flow simulation" };
const SIMULATION_HINT: LocalizedText = {
  en: "Practice issuing an alert and watch every delivery channel fire, without notifying anyone.",
  fil: "Magsanay mag-issue ng alerto at panoorin ang bawat delivery channel, walang aabisuhan.",
};

const ZONES_UNDER_ALERT: LocalizedText = { en: "Zones under alert", fil: "Zone na may alerto" };
const OF_TOTAL: LocalizedText = { en: "of", fil: "sa" };
const REPORTS_TODAY: LocalizedText = { en: "Reports today", fil: "Ulat ngayon" };
const ACROSS_ALL_ZONES: LocalizedText = { en: "across all zones", fil: "sa lahat ng zone" };
const HEAVIEST_RAIN: LocalizedText = { en: "Heaviest rainfall", fil: "Pinakamalakas na ulan" };
const CENTERS_FULL: LocalizedText = { en: "Centers at capacity", fil: "Punong center" };
const CENTERS_NOTE: LocalizedText = { en: "full or limited", fil: "puno o limitado" };
const COMMUNITY_PINS: LocalizedText = { en: "Community pins", fil: "Community pins" };
const UNVERIFIED: LocalizedText = { en: "unverified, resident-reported", fil: "hindi pa na-verify, galing sa residente" };
const ACTIVE_CYCLONE: LocalizedText = { en: "Tropical cyclone", fil: "Bagyo" };
const NONE_TRACKED: LocalizedText = { en: "None tracked", fil: "Wala" };
const AWAY: LocalizedText = { en: "away", fil: "ang layo" };
const HIGHEST_RISK_SCORE: LocalizedText = { en: "Highest risk score", fil: "Pinakamataas na risk score" };
const RISK_SCORE_HINT: LocalizedText = {
  en: "computed, advisory only — not the actual alert",
  fil: "kinakalkula, payo lamang — hindi ang aktwal na alerto",
};

export default function AdminPage() {
  const { lang } = useLanguage();
  const overrides = useZoneOverrides();
  const pins = useCommunityPins();

  const zonesUnderAlert = MOCK_ZONES.filter(
    (zone) => getZoneStatus(resolveEffectiveAlert(zone.id, overrides[zone.id]?.alertSeverity)) !== "safe"
  ).length;
  const reportsToday = MOCK_ZONES.reduce((sum, zone) => sum + getReportsTodayForZone(zone.id), 0);
  const heaviestRain = Math.max(...MOCK_ZONES.map((zone) => getRainfallForZone(zone.id)));
  const constrainedCenters = MOCK_ZONES.filter((zone) => {
    const status = resolveEffectiveCenterStatus(
      zone.centerStatus,
      overrides[zone.id]?.centerStatus,
      zone.evacuationCenterCapacity,
      overrides[zone.id]?.currentOccupancy
    );
    return status !== "space_available";
  }).length;
  const zoneStates = MOCK_ZONES.map((zone) => computeZoneState(buildZoneInputForZone(zone, MOCK_ZONES)));
  const highestRiskState = zoneStates.reduce((highest, state) =>
    state.riskScore > highest.riskScore ? state : highest
  );
  const highestRiskZone = MOCK_ZONES.find((zone) => zone.id === highestRiskState.zoneId)!;

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-2xl space-y-6 lg:max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">{t(SUBTITLE, lang)}</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t(AT_A_GLANCE, lang)}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label={t(ZONES_UNDER_ALERT, lang)}
              value={zonesUnderAlert}
              hint={`${t(OF_TOTAL, lang)} ${MOCK_ZONES.length}`}
              icon={AlertTriangle}
              accentClass={zonesUnderAlert > 0 ? "text-severity-orange" : "text-green-500"}
            />
            <StatCard
              label={t(REPORTS_TODAY, lang)}
              value={reportsToday}
              hint={t(ACROSS_ALL_ZONES, lang)}
              icon={Users}
            />
            <StatCard
              label={t(HEAVIEST_RAIN, lang)}
              value={heaviestRain}
              unit="mm/hr"
              hint={isHeavyRainfall(heaviestRain) ? t({ en: "Heavy", fil: "Malakas" }, lang) : undefined}
              icon={CloudRain}
              accentClass={isHeavyRainfall(heaviestRain) ? "text-severity-orange" : "text-foreground"}
            />
            <StatCard
              label={t(CENTERS_FULL, lang)}
              value={constrainedCenters}
              hint={t(CENTERS_NOTE, lang)}
              icon={Building2}
              accentClass={constrainedCenters > 0 ? "text-severity-yellow" : "text-green-500"}
            />
            <StatCard
              label={t(COMMUNITY_PINS, lang)}
              value={pins.length}
              hint={t(UNVERIFIED, lang)}
              icon={MapPin}
            />
            <StatCard
              label={t(ACTIVE_CYCLONE, lang)}
              value={MOCK_TYPHOON ? MOCK_TYPHOON.name : t(NONE_TRACKED, lang)}
              hint={MOCK_TYPHOON ? `${MOCK_TYPHOON.distanceKm}km ${MOCK_TYPHOON.bearing} ${t(AWAY, lang)}` : undefined}
              icon={Wind}
              accentClass={MOCK_TYPHOON ? "text-severity-orange" : "text-foreground"}
            />
            <StatCard
              label={t(HIGHEST_RISK_SCORE, lang)}
              value={highestRiskState.riskScore}
              hint={`${highestRiskZone.name} — ${t(RISK_SCORE_HINT, lang)}`}
              icon={Activity}
              accentClass={highestRiskState.riskScore >= 50 ? "text-severity-orange" : "text-foreground"}
            />
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t(HAZARDS, lang)}</h2>
          <FloodMonitoringPanel zones={MOCK_ZONES} />
          <RainfallMonitoringPanel zones={MOCK_ZONES} />
          <div className="grid gap-4 lg:grid-cols-2">
            <TyphoonTrackingPanel />
            <LandslideRiskPanel zones={MOCK_ZONES} />
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t(ANALYTICS, lang)}</h2>
          <ReportTrendPanel zones={MOCK_ZONES} />
          <AlertAnalyticsPanel zones={MOCK_ZONES} />
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t(OPERATIONS, lang)}</h2>

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{t(OPEN_MAP, lang)}</p>
                <p lang={lang} className="text-sm text-muted-foreground">
                  {t(MAP_HINT, lang)}
                </p>
              </div>
              <Button asChild>
                <Link href="/admin/map">
                  <Map aria-hidden="true" className="h-4 w-4" />
                  {t(OPEN_MAP_ACTION, lang)}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <EvacuationManagementPanel zones={MOCK_ZONES} />
          <CommunityPinModerationPanel zones={MOCK_ZONES} />

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{t(RUN_SIMULATION, lang)}</p>
                <p lang={lang} className="text-sm text-muted-foreground">
                  {t(SIMULATION_HINT, lang)}
                </p>
              </div>
              <Button asChild>
                <Link href="/admin/simulation">
                  <Play aria-hidden="true" className="h-4 w-4" />
                  {t({ en: "Open simulation", fil: "Buksan ang simulation" }, lang)}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
