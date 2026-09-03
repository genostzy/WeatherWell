"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  CloudRain,
  Droplet,
  Mountain,
  Phone,
  Thermometer,
  Users,
  Waves,
  Wind,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/features/alerts/severity-badge";
import { useLanguage } from "@/features/i18n/language-provider";
import { useSelectedZone } from "@/features/zones/use-selected-zone";
import { t } from "@/lib/i18n";
import {
  getRainfallForZone,
  getWindForZone,
  getHeatIndexForZone,
  getHazardSusceptibilityForZone,
  getReportsTodayForZone,
  getPredictionsForZone,
  getCascadeForZone,
  isHeavyRainfall,
} from "@/lib/mock-data";
import { useCommunityPins } from "@/lib/community-pins";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL, type ZoneStatus } from "@/lib/zone-status";
import { CENTER_STATUS_LABEL, CENTER_STATUS_CLASS } from "@/lib/center-status";
import { useZoneOverrides, resolveEffectiveAlert, resolveEffectiveCenterStatus } from "@/lib/zone-overrides";
import type { HazardRiskLevel, HazardType, LocalizedText, Zone } from "@/lib/types";

const CLEAR_NO_ALERT: LocalizedText = { en: "Clear — no active alert", fil: "Ligtas — walang aktibong alerto" };
const PLACEHOLDER_BOUNDARY: LocalizedText = {
  en: "Placeholder — real barangay boundary data lands in Phase 2",
  fil: "Placeholder — ang totoong boundary data ay darating sa Phase 2",
};
const YOUR_ZONE: LocalizedText = { en: "Your zone", fil: "Iyong zone" };
const ALL_ZONES: LocalizedText = { en: "All", fil: "Lahat" };
const CONDITIONS_NOW: LocalizedText = { en: "Conditions now", fil: "Kondisyon ngayon" };
const BASELINE_RISK: LocalizedText = { en: "Baseline hazard risk", fil: "Panganib ng lugar" };
const EVACUATION: LocalizedText = { en: "Evacuation", fil: "Paglikas" };
const REPORTS_TODAY: LocalizedText = { en: "reports today", fil: "ulat ngayon" };
const PINS: LocalizedText = { en: "flood pins", fil: "flood pins" };
const NEXT_EXPECTED: LocalizedText = { en: "Next expected", fil: "Susunod na inaasahan" };
const HEADS_UP: LocalizedText = { en: "Heads-up from upstream", fil: "Babala mula sa itaas" };
const VIEW_EVACUATION: LocalizedText = { en: "Evacuation steps", fil: "Hakbang sa paglikas" };
const REPORT_WATER: LocalizedText = { en: "Report water level", fil: "Iulat ang tubig" };
const NO_ZONES_MATCH: LocalizedText = { en: "No zones with this status right now.", fil: "Walang zone na ganito ngayon." };

const HAZARD_LABEL: Record<HazardType, LocalizedText> = {
  flood: { en: "Flood", fil: "Baha" },
  landslide: { en: "Landslide", fil: "Guho" },
  storm_surge: { en: "Storm surge", fil: "Storm surge" },
};
const HAZARD_ICON: Record<HazardType, typeof Droplet> = {
  flood: Droplet,
  landslide: Mountain,
  storm_surge: Waves,
};
const RISK_LABEL: Record<HazardRiskLevel, LocalizedText> = {
  low: { en: "Low", fil: "Mababa" },
  medium: { en: "Medium", fil: "Katamtaman" },
  high: { en: "High", fil: "Mataas" },
};
const RISK_CLASS: Record<HazardRiskLevel, string> = {
  low: "text-muted-foreground",
  medium: "text-severity-yellow",
  high: "text-severity-orange",
};

const STATUS_FILTERS: ZoneStatus[] = ["safe", "cautionary", "dangerous", "hazardous"];

/**
 * The zones list — every barangay at once, with enough on each card to answer
 * "what's happening there and what do I do" without opening anything. The
 * homepage map answers that for the resident's own zone; this page is how they
 * check the barangays around them (family, work, the road home).
 */
export function ZoneMap({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const overrides = useZoneOverrides();
  const pins = useCommunityPins();
  const selectedZone = useSelectedZone();
  const [statusFilter, setStatusFilter] = useState<ZoneStatus | "all">("all");

  const statusOf = (zone: Zone) =>
    getZoneStatus(resolveEffectiveAlert(zone.id, overrides[zone.id]?.alertSeverity));

  const countByStatus = (status: ZoneStatus) => zones.filter((zone) => statusOf(zone) === status).length;
  const visibleZones = statusFilter === "all" ? zones : zones.filter((zone) => statusOf(zone) === statusFilter);

  return (
    <div className="w-full max-w-md space-y-4 md:max-w-2xl lg:max-w-5xl">
      {/* Status filter doubles as the summary count — one row instead of a
          separate stat strip plus a filter bar. */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={statusFilter === "all" ? "default" : "outline"}
          onClick={() => setStatusFilter("all")}
        >
          {t(ALL_ZONES, lang)} ({zones.length})
        </Button>
        {STATUS_FILTERS.map((status) => {
          const count = countByStatus(status);
          return (
            <Button
              key={status}
              type="button"
              size="sm"
              variant={statusFilter === status ? "default" : "outline"}
              onClick={() => setStatusFilter(status)}
              disabled={count === 0}
            >
              {t(ZONE_STATUS_LABEL[status], lang)} ({count})
            </Button>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {visibleZones.map((zone) => {
          const alert = resolveEffectiveAlert(zone.id, overrides[zone.id]?.alertSeverity);
          const status = getZoneStatus(alert);
          const color = getZoneStatusColor(alert);
          const susceptibility = getHazardSusceptibilityForZone(zone.id);
          const centerStatus = resolveEffectiveCenterStatus(
            zone.centerStatus,
            overrides[zone.id]?.centerStatus,
            zone.evacuationCenterCapacity,
            overrides[zone.id]?.currentOccupancy
          );
          const rainfall = getRainfallForZone(zone.id);
          const zonePins = pins.filter((pin) => pin.zoneId === zone.id).length;
          const predictions = getPredictionsForZone(zone.id);
          const nextPrediction = predictions.find((step) => step.severity !== alert?.severity);
          const cascade = getCascadeForZone(zone.id);
          const isOwnZone = zone.id === selectedZone.id;

          return (
            <Card key={zone.id} data-testid="zone-region" className="gap-0 overflow-hidden py-0">
              <div className="h-2 w-full" style={{ backgroundColor: color }} />

              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <p className="truncate font-medium">{zone.name}</p>
                    </div>
                    <p className="text-lg font-bold" style={{ color }}>
                      {t(ZONE_STATUS_LABEL[status], lang)}
                    </p>
                  </div>
                  {isOwnZone && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {t(YOUR_ZONE, lang)}
                    </Badge>
                  )}
                </div>

                {alert ? (
                  <div className="space-y-1.5">
                    <SeverityBadge severity={alert.severity} />
                    <p lang={lang} className="text-sm">
                      {t(alert.message, lang)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-green-500">{t(CLEAR_NO_ALERT, lang)}</p>
                )}

                {cascade && (
                  <div className="rounded-md border-2 border-severity-yellow/50 bg-severity-yellow/10 p-2">
                    <p className="text-xs font-medium text-severity-yellow">{t(HEADS_UP, lang)}</p>
                    <p lang={lang} className="text-xs">
                      {t(cascade.message, lang)}
                    </p>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{t(CONDITIONS_NOW, lang)}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    <span className="flex items-center gap-1">
                      <CloudRain
                        aria-hidden="true"
                        className={`h-4 w-4 ${isHeavyRainfall(rainfall) ? "text-severity-orange" : "text-muted-foreground"}`}
                      />
                      {rainfall} mm/hr
                    </span>
                    <span className="flex items-center gap-1">
                      <Wind aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                      {getWindForZone(zone.id)} km/h
                    </span>
                    <span className="flex items-center gap-1">
                      <Thermometer aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                      {getHeatIndexForZone(zone.id)}°C
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">{t(BASELINE_RISK, lang)}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {(Object.keys(HAZARD_LABEL) as HazardType[]).map((hazard) => {
                      const Icon = HAZARD_ICON[hazard];
                      const risk = susceptibility[hazard];
                      return (
                        <span key={hazard} className={`flex items-center gap-1 ${RISK_CLASS[risk]}`}>
                          <Icon aria-hidden="true" className="h-4 w-4" />
                          {t(HAZARD_LABEL[hazard], lang)}: {t(RISK_LABEL[risk], lang)}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {nextPrediction && (
                  <p className="text-xs text-muted-foreground">
                    {t(NEXT_EXPECTED, lang)}: {t(nextPrediction.label, lang)} ·{" "}
                    {t(nextPrediction.timing, lang)}
                  </p>
                )}

                <div className="space-y-1 border-t pt-2">
                  <p className="text-xs font-medium text-muted-foreground">{t(EVACUATION, lang)}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{zone.evacuationCenterName}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${CENTER_STATUS_CLASS[centerStatus]}`}>
                      {t(CENTER_STATUS_LABEL[centerStatus], lang)}
                    </span>
                    <a
                      href={`tel:${zone.hotlineNumber}`}
                      className="flex items-center gap-1 text-sm underline-offset-2 hover:underline"
                    >
                      <Phone aria-hidden="true" className="h-3.5 w-3.5" />
                      {zone.hotlineNumber}
                    </a>
                  </div>
                  <p lang={lang} className="text-xs text-muted-foreground">
                    {t(zone.evacuationRouteText, lang)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users aria-hidden="true" className="h-3.5 w-3.5" />
                    {getReportsTodayForZone(zone.id)} {t(REPORTS_TODAY, lang)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                    {zonePins} {t(PINS, lang)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild size="sm" variant="outline">
                    <Link href="/evacuation">
                      {t(VIEW_EVACUATION, lang)}
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/report">{t(REPORT_WATER, lang)}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {visibleZones.length === 0 && (
        <p className="text-sm text-muted-foreground">{t(NO_ZONES_MATCH, lang)}</p>
      )}

      <p className="text-xs text-muted-foreground">{t(PLACEHOLDER_BOUNDARY, lang)}</p>
    </div>
  );
}
