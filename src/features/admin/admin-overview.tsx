"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Building2,
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
import { TyphoonTrackingPanel } from "@/features/admin/typhoon-tracking-panel";
import { LandslideRiskPanel } from "@/features/admin/landslide-risk-panel";
import { EvacuationManagementPanel } from "@/features/admin/evacuation-management-panel";
import { CommunityPinModerationPanel } from "@/features/admin/community-pin-moderation-panel";
import { NoZonesNotice } from "@/features/admin/no-zones-notice";
import { OfficialInbox } from "@/features/admin/official-inbox";
import { OfficialMessagesPanel } from "@/features/admin/official-messages-panel";
import { TownBarangaysPanel, type TownOfficial } from "@/features/admin/town-barangays-panel";
import { CalibrationPanel, type CalibrationEvent } from "@/features/admin/calibration-panel";
import { useWaterLevelReports } from "@/lib/water-level-reports";
import { countReportsToday } from "@/lib/reports-today";
import { useTyphoon } from "@/lib/use-typhoon";
import { resolveEffectiveCenterStatus } from "@/lib/center-status";
import { useAlerts } from "@/lib/alerts-store";
import { useCommunityPins } from "@/lib/community-pins";
import { useHazards, useZones } from "@/lib/reference-data/use-reference-data";
import { getZoneStatus } from "@/lib/zone-status";
import { useOfficial } from "@/lib/auth/official-context";
import { isInArea } from "@/lib/auth/official";
import { hasRealEvacuationCenter } from "@/lib/zone-data-quality";
import type { LocalizedText } from "@/lib/types";

const SYSTEM_TITLE: LocalizedText = { en: "System dashboard", fil: "Dashboard ng sistema" };
const SYSTEM_SUBTITLE: LocalizedText = {
  en: "Every barangay nationwide — officials, alerts, crowd reports and evacuation capacity",
  fil: "Bawat barangay sa buong bansa — mga opisyal, alerto, ulat at kapasidad ng evacuation",
};
const TOWN_TITLE: LocalizedText = { en: "{town} dashboard", fil: "Dashboard ng {town}" };
const TOWN_SUBTITLE: LocalizedText = {
  en: "Every barangay in {town} — alerts, centres, reports, and updates from barangay officials",
  fil: "Bawat barangay sa {town} — alerto, center, ulat, at update mula sa mga opisyal ng barangay",
};
const AT_A_GLANCE: LocalizedText = { en: "At a glance", fil: "Sa isang sulyap" };
const HAZARDS: LocalizedText = { en: "Hazard monitoring", fil: "Pagsubaybay sa panganib" };
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
const NATIONWIDE_NOTICE: LocalizedText = {
  en: "You manage every zone nationwide, so per-zone lists are not shown here — open the map for zone-by-zone detail.",
  fil: "Pinamamahalaan mo ang bawat zone sa buong bansa, kaya hindi ipinapakita dito ang per-zone na listahan — buksan ang mapa para sa detalye ng bawat zone.",
};

const ZONES_UNDER_ALERT: LocalizedText = { en: "Zones under alert", fil: "Zone na may alerto" };
const OF_TOTAL: LocalizedText = { en: "of", fil: "sa" };
const REPORTS_TODAY: LocalizedText = { en: "Reports today", fil: "Ulat ngayon" };
const ACROSS_ALL_ZONES: LocalizedText = { en: "across all zones", fil: "sa lahat ng zone" };
const CENTERS_FULL: LocalizedText = { en: "Centers at capacity", fil: "Punong center" };
const CENTERS_NOTE: LocalizedText = { en: "full or limited", fil: "puno o limitado" };
const COMMUNITY_PINS: LocalizedText = { en: "Community pins", fil: "Community pins" };
const UNVERIFIED: LocalizedText = { en: "unverified, resident-reported", fil: "hindi pa na-verify, galing sa residente" };
const ACTIVE_CYCLONE: LocalizedText = { en: "Tropical cyclone", fil: "Bagyo" };
const NONE_TRACKED: LocalizedText = { en: "None tracked", fil: "Wala" };

/** The part of the calibration record inside this dashboard's area. */
function inArea(
  calibration: { bars: Record<string, number>; events: CalibrationEvent[] },
  zoneIds: Set<string>
): { bars: Record<string, number>; events: CalibrationEvent[] } {
  return {
    bars: Object.fromEntries(Object.entries(calibration.bars).filter(([zoneId]) => zoneIds.has(zoneId))),
    events: calibration.events.filter((event) => zoneIds.has(event.zoneId)),
  };
}

export function AdminOverview({
  townOfficials = [],
  calibration,
}: {
  townOfficials?: TownOfficial[];
  calibration?: { bars: Record<string, number>; events: CalibrationEvent[] };
} = {}) {
  const { lang } = useLanguage();
  const official = useOfficial();
  const pins = useCommunityPins();
  // The database enforces the real limit; this filter only decides what an
  // official sees and can act on — a barangay official's own barangay, or
  // every barangay in a municipal official's town.
  const allZones = useZones();
  const zones = allZones.filter((zone) => isInArea(zone.psgcBarangayCode, official.areaCode));
  const hazards = useHazards();
  const reports = useWaterLevelReports();
  const alerts = useAlerts();
  const { track: typhoonTrack } = useTyphoon();
  const baseAlertFor = (zoneId: string) => alerts.find((a) => a.zoneId === zoneId && a.isActive);

  // Reachable in production (see NoZonesNotice's doc comment), not just a
  // test fixture: every computation below assumes at least one zone.
  if (zones.length === 0) {
    return <NoZonesNotice lang={lang} />;
  }

  // Only pins in a zone the official manages — the KPI tile is otherwise the
  // one number on this screen that would silently mean something different
  // from the six tiles beside it.
  const inAreaZoneIds = new Set(zones.map((zone) => zone.id));
  const scopedPins = pins.filter((pin) => inAreaZoneIds.has(pin.zoneId));

  const zonesUnderAlert = zones.filter((zone) => getZoneStatus(baseAlertFor(zone.id)) !== "safe").length;
  const reportsToday = countReportsToday(reports, inAreaZoneIds);
  // Verified centres only: a placeholder has capacity 0, which reads as
  // "full" and put ~41k barangays with no centre at all in this tile.
  const constrainedCenters = zones.filter(hasRealEvacuationCenter).filter((zone) => {
    const status = resolveEffectiveCenterStatus(zone.centerStatus, zone.evacuationCenterCapacity, zone.currentOccupancy);
    return status !== "space_available";
  }).length;
  // An admin's areaCode ("") matches every zone nationwide (~42k in
  // production): one row per zone in the panels below froze the browser tab
  // at that scale, so an admin gets a pointer to the map instead.
  const isNationwide = official.level === "admin";
  const isTown = official.level === "municipality";
  const title = isNationwide ? t(SYSTEM_TITLE, lang) : t(TOWN_TITLE, lang).replace("{town}", official.areaName);
  const subtitle = isNationwide ? t(SYSTEM_SUBTITLE, lang) : t(TOWN_SUBTITLE, lang).replace("{town}", official.areaName);
  // M5: every barangay's landslide susceptibility is "unknown" until real
  // DENR-MGB data is loaded, and a panel listing "Unknown / Normal" for all
  // of them is noise. It appears on its own once any barangay has data.
  const hasLandslideData = zones.some((zone) => {
    const level = hazards[zone.id]?.landslide;
    return level !== undefined && level !== "unknown";
  });

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-2xl space-y-6 lg:max-w-5xl">
        <div>
          <h1 lang={lang} className="text-2xl font-bold">{title}</h1>
          <p lang={lang} className="text-muted-foreground">{subtitle}</p>
        </div>

        <OfficialInbox zones={zones} />

        {isTown && (
          <div className="grid gap-4 lg:grid-cols-2">
            <OfficialMessagesPanel />
            <TownBarangaysPanel zones={zones} officials={townOfficials} />
          </div>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t(AT_A_GLANCE, lang)}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label={t(ZONES_UNDER_ALERT, lang)}
              value={zonesUnderAlert}
              hint={`${t(OF_TOTAL, lang)} ${zones.length}`}
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
              label={t(CENTERS_FULL, lang)}
              value={constrainedCenters}
              hint={t(CENTERS_NOTE, lang)}
              icon={Building2}
              accentClass={constrainedCenters > 0 ? "text-severity-yellow" : "text-green-500"}
            />
            <StatCard
              label={t(COMMUNITY_PINS, lang)}
              value={scopedPins.length}
              hint={t(UNVERIFIED, lang)}
              icon={MapPin}
            />
            <StatCard
              label={t(ACTIVE_CYCLONE, lang)}
              value={typhoonTrack ? typhoonTrack.name : t(NONE_TRACKED, lang)}
              hint={typhoonTrack ? (typhoonTrack.wind_signal > 0 ? `Signal ${typhoonTrack.wind_signal}` : undefined) : undefined}
              icon={Wind}
              accentClass={typhoonTrack ? "text-severity-orange" : "text-foreground"}
            />
          </div>
        </section>

        <Separator />

        {isNationwide && (
          <Card>
            <CardContent className="pt-6">
              <p lang={lang} className="text-sm text-muted-foreground">
                {t(NATIONWIDE_NOTICE, lang)}
              </p>
            </CardContent>
          </Card>
        )}

        {calibration && (
          <CalibrationPanel {...inArea(calibration, new Set(zones.map((zone) => zone.id)))} />
        )}

        {!isNationwide && (
          <>
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">{t(HAZARDS, lang)}</h2>
              {/* A town's barangays, with their reports, are already listed above. */}
              {!isTown && <FloodMonitoringPanel zones={zones} />}
              <div className="grid gap-4 lg:grid-cols-2">
                <TyphoonTrackingPanel />
                {hasLandslideData && <LandslideRiskPanel zones={zones} />}
              </div>
            </section>
          </>
        )}

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

          {!isNationwide && (
            <>
              <EvacuationManagementPanel zones={zones} />
              <CommunityPinModerationPanel zones={zones} />
            </>
          )}

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
