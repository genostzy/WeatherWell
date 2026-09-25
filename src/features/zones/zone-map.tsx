"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Building2,
  MapPin,
  Search,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { useSelectedZone } from "@/features/zones/use-selected-zone";
import { t } from "@/lib/i18n";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL, type ZoneStatus } from "@/lib/zone-status";
import { CENTER_STATUS_LABEL, CENTER_STATUS_CLASS, resolveEffectiveCenterStatus } from "@/lib/center-status";
import { useAlerts } from "@/lib/alerts-store";
import { SEVERITY_ORDER } from "@/lib/severity";
import { hasRealEvacuationCenter } from "@/lib/zone-data-quality";
import type { LanguageCode, LocalizedText, Zone } from "@/lib/types";

const PAGE_SIZE = 20;

const NO_CENTER_SHORT: LocalizedText = { en: "No verified evacuation centre", fil: "Walang beripikadong evacuation centre" };
const YOUR_ZONE: LocalizedText = { en: "Your zone", fil: "Iyong zone" };
const ALL_ZONES: LocalizedText = { en: "All", fil: "Lahat" };
const VIEW_EVACUATION: LocalizedText = { en: "Evacuation", fil: "Paglikas" };
const REPORT_WATER: LocalizedText = { en: "Report", fil: "Iulat" };
const NO_ZONES_MATCH: LocalizedText = { en: "No zones with this status right now.", fil: "Walang zone na ganito ngayon." };
const SEARCH_PLACEHOLDER: LocalizedText = { en: "Search zone, municipality…", fil: "Maghanap ng zone, munisipalidad…" };
const LOAD_MORE: LocalizedText = { en: "Load more", fil: "Dagdagan pa" };
const SHOWING: LocalizedText = { en: "Showing", fil: "Nagpapakita" };
const OF: LocalizedText = { en: "of", fil: "sa" };

const STATUS_FILTERS: ZoneStatus[] = ["safe", "cautionary", "dangerous", "hazardous"];

export function ZoneMap({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const selectedZone = useSelectedZone();
  const alerts = useAlerts();
  const [statusFilter, setStatusFilter] = useState<ZoneStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const alertMap = useMemo(() => {
    const m = new Map<string, typeof alerts[0]>();
    for (const a of alerts) {
      if (a.isActive) m.set(a.zoneId, a);
    }
    return m;
  }, [alerts]);

  const countByStatus = (status: ZoneStatus) => {
    return zones.filter((zone) => {
      const s = getZoneStatus(alertMap.get(zone.id));
      return s === status;
    }).length;
  };

  const filteredZones = useMemo(() => {
    const statusOf = (zone: Zone) =>
      getZoneStatus(alertMap.get(zone.id));

    let list = zones;
    if (statusFilter !== "all") {
      list = list.filter((zone) => statusOf(zone) === statusFilter);
    }
    if (searchQuery.length >= 2) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (z) =>
          z.name.toLowerCase().includes(q) ||
          z.municipalityName.toLowerCase().includes(q) ||
          z.provinceName.toLowerCase().includes(q)
      );
    }
    // Your barangay first, then any under alert (most severe first), then
    // the rest of your town, then everyone else. It used to open on Adams,
    // Ilocos Norte, for every resident in the country.
    const townCode = selectedZone.psgcBarangayCode.slice(0, 7);
    const rank = (zone: Zone) => {
      if (zone.id === selectedZone.id) return 0;
      const alert = alertMap.get(zone.id);
      if (alert) return 1 + (SEVERITY_ORDER.length - SEVERITY_ORDER.indexOf(alert.severity)) / 10;
      if (zone.psgcBarangayCode.startsWith(townCode)) return 2;
      return 3;
    };
    return list
      .map((zone) => ({ zone, r: rank(zone) }))
      .sort((a, b) => a.r - b.r || a.zone.name.localeCompare(b.zone.name))
      .map(({ zone }) => zone);
  }, [zones, statusFilter, searchQuery, alertMap, selectedZone]);

  const visibleZones = filteredZones.slice(0, visibleCount);
  const hasMore = visibleCount < filteredZones.length;

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setVisibleCount(PAGE_SIZE);
  }, []);

  return (
    <div className="w-full max-w-md space-y-3 md:max-w-2xl lg:max-w-5xl">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t(SEARCH_PLACEHOLDER, lang)}
          className="w-full rounded-lg border-2 border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={statusFilter === "all" ? "default" : "outline"}
          onClick={() => { setStatusFilter("all"); setVisibleCount(PAGE_SIZE); }}
          className="h-7 text-xs"
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
              onClick={() => { setStatusFilter(status); setVisibleCount(PAGE_SIZE); }}
              disabled={count === 0}
              className="h-7 text-xs"
            >
              {t(ZONE_STATUS_LABEL[status], lang)} ({count})
            </Button>
          );
        })}
      </div>

      {/* Zone list */}
      <div className="space-y-2">
        {visibleZones.map((zone) => (
          <ZoneRow
            key={zone.id}
            zone={zone}
            lang={lang}
            alert={alertMap.get(zone.id)}
            isOwnZone={zone.id === selectedZone.id}
          />
        ))}
      </div>

      {visibleZones.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">{t(NO_ZONES_MATCH, lang)}</p>
      )}

      {hasMore && (
        <div className="flex flex-col items-center gap-2 py-2">
          <p className="text-xs text-muted-foreground">
            {t(SHOWING, lang)} {visibleCount} {t(OF, lang)} {filteredZones.length}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            {t(LOAD_MORE, lang)}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact zone row — shows essential info at a glance.
 * Much lighter than the old Card: just status, name, evac center, and action links.
 */
function ZoneRow({
  zone,
  lang,
  alert,
  isOwnZone,
}: {
  zone: Zone;
  lang: LanguageCode;
  alert: ReturnType<typeof useAlerts>[number] | undefined;
  isOwnZone: boolean;
}) {
  const status = getZoneStatus(alert);
  const color = getZoneStatusColor(alert);
  const centerStatus = resolveEffectiveCenterStatus(
    zone.centerStatus,
    zone.evacuationCenterCapacity,
    zone.currentOccupancy
  );

  return (
    <Card data-testid="zone-region" className="gap-0 overflow-hidden py-0">
      <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: color }} />
      <CardContent className="flex items-center gap-3 p-3">
        {/* Status indicator */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-[10px] font-medium leading-tight" style={{ color }}>
            {t(ZONE_STATUS_LABEL[status], lang)}
          </span>
        </div>

        {/* Zone info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <MapPin aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />
            <p className="truncate text-sm font-medium">{zone.name}</p>
            {isOwnZone && (
              <Badge variant="outline" className="shrink-0 px-1 py-0 text-[10px]">
                {t(YOUR_ZONE, lang)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              <span className="truncate">
                {hasRealEvacuationCenter(zone) ? zone.evacuationCenterName : t(NO_CENTER_SHORT, lang)}
              </span>
            </span>
            {hasRealEvacuationCenter(zone) && (
              <span className={`shrink-0 rounded px-1 py-0 text-[10px] font-medium ${CENTER_STATUS_CLASS[centerStatus]}`}>
                {t(CENTER_STATUS_LABEL[centerStatus], lang)}
              </span>
            )}
          </div>
        </div>

        {/* Quick stats + actions */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex gap-1">
            <Button asChild size="sm" variant="ghost" className="h-6 px-1.5 text-xs">
              <Link href="/evacuation">
                {t(VIEW_EVACUATION, lang)}
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="h-6 px-1.5 text-xs">
              <Link href="/report">
                {t(REPORT_WATER, lang)}
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
