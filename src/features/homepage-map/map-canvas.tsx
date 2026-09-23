"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Marker, Polyline, Popup, Tooltip, useMapEvents, useMap } from "react-leaflet";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { useAlerts } from "@/lib/alerts-store";
import { useCommunityPins, voteOnPin, hasVotedOnPin, isOwnPin, type CommunityPin } from "@/lib/community-pins";
import { useSessionUserId } from "@/lib/auth/anonymous-session";
import { PIN_STATUS_LABEL } from "@/lib/community-pin";
import { MapShell } from "@/features/map/map-shell";
import { ViewportTracker, viewportRadiusDeg, viewportMarkerCap } from "@/features/map/viewport-tracker";
import { HazardBackdropLayer } from "@/features/map/hazard-backdrop-layer";
import { PoiMarkerLayer } from "@/features/map/poi-marker-layer";
import { HistoricalEventsLayer } from "@/features/map/historical-events-layer";
import {
  createStatusMarkerIcon,
  createEvacuationMarkerIcon,
  createCommunityPinMarkerIcon,
  createUserLocationIcon,
  createClusteredEvacMarkerIcon,
} from "@/features/map/marker-icons";
import { MarkerLegend } from "@/features/map/marker-legend";
import { HazardTypeSelector, hazardMapTitle } from "@/features/map/hazard-type-selector";
import { hasRealEvacuationCenter } from "@/lib/zone-data-quality";
import type { HazardType, LocalizedText, Zone } from "@/lib/types";

const MAP_ARIA_LABEL: LocalizedText = {
  en: "Interactive flood zone map",
  fil: "Interactibong mapa ng flood zone",
};
const VIEW_EVACUATION_DETAILS: LocalizedText = {
  en: "View evacuation details",
  fil: "Tingnan ang detalye ng evacuation",
};
const UNVERIFIED_REPORT: LocalizedText = {
  en: "Unverified community report",
  fil: "Hindi pa na-verify na ulat ng komunidad",
};
const UPVOTE: LocalizedText = { en: "Upvote", fil: "I-upvote" };
const DOWNVOTE: LocalizedText = { en: "Downvote", fil: "I-downvote" };
const ALREADY_VOTED: LocalizedText = { en: "You already voted on this pin", fil: "Nakaboto ka na sa pin na ito" };
const EDIT_PIN: LocalizedText = { en: "Edit", fil: "I-edit" };
const DELETE_PIN: LocalizedText = { en: "Delete", fil: "Burahin" };
const YOUR_PIN: LocalizedText = { en: "Your pin", fil: "Iyong pin" };
const VIEW_PHOTO: LocalizedText = { en: "View full photo", fil: "Tingnan ang buong larawan" };
const LOCATE_ME: LocalizedText = { en: "Locate me", fil: "Hanapin ako" };
const YOUR_LOCATION: LocalizedText = { en: "Your location", fil: "Iyong lokasyon" };
const SEARCH_PLACEHOLDER: LocalizedText = { en: "Search zone…", fil: "Maghanap ng zone…" };
const LAYERS_TITLE: LocalizedText = { en: "Layers", fil: "Mga Layer" };
const LAYER_STATUS: LocalizedText = { en: "Status", fil: "Status" };
const LAYER_EVAC: LocalizedText = { en: "Evacuation", fil: "Evacuation" };
const LAYER_POI: LocalizedText = { en: "POIs", fil: "Mga POI" };
const LAYER_PINS: LocalizedText = { en: "Pins", fil: "Mga Pin" };
const LAYER_HAZARD: LocalizedText = { en: "Hazards", fil: "Mga Hazard" };
const LAYER_HISTORICAL: LocalizedText = { en: "Historical events", fil: "Nakaraang mga pangyayari" };
const NEAREST_EVAC_LABEL: LocalizedText = { en: "Nearest evac", fil: "Pinakamalapit na evac" };
const EVAC_FULL: LocalizedText = { en: "Full", fil: "Puno" };
const EVAC_AVAILABLE: LocalizedText = { en: "Available", fil: "May espasyo" };

/** Only mounted while `isPlacingPin` — reports the resident's tap back up without adding a permanent click handler to the whole map. */
function PinPlacer({ onPlace }: { onPlace: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPlace(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

/** Centers the map on the user's GPS position. */
function FlyToUser({ position }: { position: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([position.lat, position.lng], Math.max(map.getZoom(), 15));
  }, [map, position]);
  return null;
}

/** Flies to a target position (from search). */
function FlyToTarget({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 16, { duration: 1.5 });
  }, [map, target]);
  return null;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * The only piece of the homepage map that actually needs Leaflet (browser-only,
 * so this module is loaded via next/dynamic with ssr:false — see homepage-map.tsx).
 * Everything that doesn't depend on Leaflet (the status headline, action
 * buttons, route text) lives in the parent instead, so those always render
 * immediately rather than waiting on this chunk to load.
 */
export function MapCanvas({
  zones,
  hazardType,
  onHazardTypeChange,
  routeZone,
  routeHazard,
  effectiveRoutePolyline,
  onSelectZone,
  isPlacingPin = false,
  onMapClickForPin,
  onEditPin,
  onDeletePin,
  onViewPhoto,
  livePosition,
  revealEvacuationCenters = false,
}: {
  zones: Zone[];
  hazardType: HazardType;
  onHazardTypeChange: (type: HazardType) => void;
  routeZone: Zone | null;
  routeHazard: boolean;
  effectiveRoutePolyline: [number, number][];
  onSelectZone: (zoneId: string) => void;
  isPlacingPin?: boolean;
  onMapClickForPin?: (lat: number, lng: number) => void;
  onEditPin?: (pin: CommunityPin) => void;
  onDeletePin?: (pin: CommunityPin) => void;
  onViewPhoto?: (pin: CommunityPin) => void;
  livePosition?: { lat: number; lng: number } | null;
  /** True once the resident has used "Find safe evacuation center" — see the layer-visibility comment below. */
  revealEvacuationCenters?: boolean;
}) {
  const { lang } = useLanguage();
  const communityPins = useCommunityPins();
  const userId = useSessionUserId();
  const alerts = useAlerts();
  const alertMap = useMemo(() => {
    const m = new Map<string, typeof alerts[0]>();
    for (const a of alerts) {
      if (a.isActive) m.set(a.zoneId, a);
    }
    return m;
  }, [alerts]);
  const initialCenter: [number, number] = [zones[0].lat, zones[0].lng];
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [searchTarget, setSearchTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState(14);
  const [viewCenter, setViewCenter] = useState<[number, number]>(initialCenter);

  const [showStatus, setShowStatus] = useState(true);
  // Hidden until the resident asks for it (search, or "Find safe evacuation
  // center") — see evacVisible below. The Layers checkbox is still a manual
  // override for a resident who wants them on regardless.
  const [showEvac, setShowEvac] = useState(false);
  const [showPoi, setShowPoi] = useState(true);
  const [showPins, setShowPins] = useState(true);
  const [showHazard, setShowHazard] = useState(true);
  /** Opt-in, unlike the layers above: nothing fetches until a resident turns this on — see useHistoricalEvents's own doc comment. */
  const [showHistorical, setShowHistorical] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Zone[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (query.length < 2) {
        setSearchResults([]);
        return;
      }
      searchTimerRef.current = setTimeout(() => {
        const q = query.toLowerCase();
        const results = zones
          .filter(
            (z) =>
              z.name.toLowerCase().includes(q) ||
              z.municipalityName.toLowerCase().includes(q) ||
              z.provinceName.toLowerCase().includes(q)
          )
          .slice(0, 8);
        setSearchResults(results);
      }, 250);
    },
    [zones]
  );

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  /**
   * Zoom-adaptive marker culling centred on the actual viewport (not zones[0]).
   * Markers now follow the user's pan and never disappear when zoomed in.
   * Shared with the admin map's own culling — see viewport-tracker.tsx.
   */
  const radiusDeg = viewportRadiusDeg(zoom);
  const markerCap = viewportMarkerCap(zoom);

  const visibleZones = useMemo(() => {
    const filtered = zones.filter(
      (z) =>
        Math.abs(z.lat - viewCenter[0]) < radiusDeg &&
        Math.abs(z.lng - viewCenter[1]) < radiusDeg
    );
    return filtered.slice(0, markerCap);
  }, [zones, viewCenter, radiusDeg, markerCap]);

  /**
   * Evacuation center display strategy:
   * - Zoom < 13: grouped by municipality (one cluster marker per city)
   * - Zoom 13-14: individual markers but within a tighter radius
   * - Zoom 15+: all nearby markers with capacity rings
   */
  const showEvacCenters = zoom >= 13;

  /**
   * Evacuation centers stay off the map until the resident actually wants
   * one: an always-on shelter layer surfaces capacity and locations nobody
   * asked to see yet. `searchQuery` covers both "typing" and "just picked a
   * result" (the result click sets it to the zone's name rather than
   * clearing it), so one condition covers the whole search interaction.
   * `revealEvacuationCenters` is the parent's signal that "Find safe
   * evacuation center" was used. `showEvac` remains a manual override via
   * the Layers panel for a resident who wants them on regardless.
   */
  const evacVisible = showEvac || searchQuery.length > 0 || revealEvacuationCenters;

  // The nationwide seed's placeholder centres are not places to send anyone.
  const realCentreZones = useMemo(() => zones.filter(hasRealEvacuationCenter), [zones]);

  /**
   * Cluster by municipality across ALL zones, not just visible radius.
   * This gives accurate counts regardless of viewport.
   * Pre-filter to a reasonable bounding box to avoid clustering all 42k zones.
   */
  const evacClusters = useMemo(() => {
    if (!showEvacCenters || zoom >= 15) return [];
    const clusterRadius = radiusDeg * 2;
    const nearby = realCentreZones.filter(
      (z) =>
        Math.abs(z.lat - viewCenter[0]) < clusterRadius &&
        Math.abs(z.lng - viewCenter[1]) < clusterRadius
    );
    const byMuni = new Map<string, Zone[]>();
    for (const z of nearby) {
      const key = z.municipalityName || "Unknown";
      const arr = byMuni.get(key) ?? [];
      arr.push(z);
      byMuni.set(key, arr);
    }
    return Array.from(byMuni.entries()).map(([municipality, zoneList]) => {
      const totalCapacity = zoneList.reduce((s, z) => s + z.evacuationCenterCapacity, 0);
      const totalOccupancy = zoneList.reduce((s, z) => s + (z.currentOccupancy ?? 0), 0);
      return {
        municipality,
        count: zoneList.length,
        lat: zoneList.reduce((s, z) => s + z.lat, 0) / zoneList.length,
        lng: zoneList.reduce((s, z) => s + z.lng, 0) / zoneList.length,
        totalCapacity,
        totalOccupancy,
      };
    });
  }, [showEvacCenters, zoom, radiusDeg, viewCenter, realCentreZones]);

  /** Individual evac centers shown at zoom 15+. */
  const individualEvacZones = useMemo(() => {
    if (zoom < 15) return [];
    return realCentreZones.filter(
      (z) =>
        Math.abs(z.lat - viewCenter[0]) < radiusDeg &&
        Math.abs(z.lng - viewCenter[1]) < radiusDeg,
    );
  }, [zoom, radiusDeg, viewCenter, realCentreZones]);

  const nearestEvac = useMemo(() => {
    if (!livePosition) return null;
    let best: { zone: Zone; distance: number } | null = null;
    // Only scan zones within ~50km — no one needs an evac center beyond that
    const maxDeg = 0.5;
    for (const z of zones) {
      if (Math.abs(z.lat - livePosition.lat) > maxDeg || Math.abs(z.lng - livePosition.lng) > maxDeg) continue;
      if (z.evacuationCenterCapacity <= 0) continue;
      if (z.currentOccupancy != null && z.currentOccupancy >= z.evacuationCenterCapacity) continue;
      const d = haversineMeters(livePosition.lat, livePosition.lng, z.evacuationCenterLat, z.evacuationCenterLng);
      if (!best || d < best.distance) best = { zone: z, distance: d };
    }
    return best;
  }, [livePosition, zones]);

  return (
    <MapShell
      center={initialCenter}
      ariaLabel={t(MAP_ARIA_LABEL, lang)}
      className={isPlacingPin ? "cursor-crosshair" : ""}
      title={zones[0] ? hazardMapTitle(hazardType, zones[0].name, lang) : undefined}
      controlsPosition="bottomright"
      overlay={
        <>
          <div className="pointer-events-auto absolute top-2 right-2">
            <MarkerLegend />
          </div>

          {/* Search bar */}
          <div className="pointer-events-auto absolute top-2 left-2 w-52">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => setShowSearch(true)}
                onBlur={() => setTimeout(() => setShowSearch(false), 200)}
                placeholder={t(SEARCH_PLACEHOLDER, lang)}
                className="w-full rounded-lg border-2 border-border bg-background/95 px-3 py-1.5 pr-8 text-xs font-medium shadow-md backdrop-blur placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <svg className="absolute right-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
              {searchResults.length > 0 && showSearch && (
                <div className="absolute left-0 top-full z-[1001] mt-1 w-full max-h-48 overflow-y-auto rounded-lg border-2 border-border bg-background shadow-lg">
                  {searchResults.map((z) => (
                    <button
                      key={z.id}
                      type="button"
                      onMouseDown={() => {
                        setSearchTarget({ lat: z.lat, lng: z.lng });
                        setSearchQuery(z.name);
                        setSearchResults([]);
                        setShowSearch(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-muted/50 first:rounded-t-lg last:rounded-b-lg"
                    >
                      <span className="font-medium">{z.name}</span>
                      <span className="ml-1 text-muted-foreground">
                        {z.municipalityName}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Layer toggle panel */}
          <div className="pointer-events-auto absolute top-12 left-2">
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-1 rounded-lg border-2 border-border bg-background/95 px-2 py-1 text-xs font-medium shadow-md backdrop-blur hover:bg-muted/50">
                <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                {t(LAYERS_TITLE, lang)}
              </summary>
              <div className="mt-1 space-y-1 rounded-lg border-2 border-border bg-background/95 p-2 shadow-md backdrop-blur">
                {[
                  { label: t(LAYER_STATUS, lang), value: showStatus, setter: setShowStatus },
                  { label: t(LAYER_EVAC, lang), value: showEvac, setter: setShowEvac },
                  { label: t(LAYER_POI, lang), value: showPoi, setter: setShowPoi },
                  { label: t(LAYER_PINS, lang), value: showPins, setter: setShowPins },
                  { label: t(LAYER_HAZARD, lang), value: showHazard, setter: setShowHazard },
                  { label: t(LAYER_HISTORICAL, lang), value: showHistorical, setter: setShowHistorical },
                ].map((layer) => (
                  <label key={layer.label} className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={layer.value}
                      onChange={(e) => layer.setter(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    {layer.label}
                  </label>
                ))}
              </div>
            </details>
          </div>

          {livePosition && (
            <button
              type="button"
              onClick={() => setFlyTarget(livePosition)}
              className="pointer-events-auto absolute bottom-14 left-2 flex items-center gap-1.5 rounded-lg border-2 border-border bg-background/95 px-2.5 py-1.5 text-xs font-medium shadow-md backdrop-blur transition-colors hover:bg-muted/50"
              aria-label={t(LOCATE_ME, lang)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v4m0 12v4M2 12h4m12 0h4"></path></svg>
              {t(LOCATE_ME, lang)}
            </button>
          )}

          {/* Nearest evac center indicator */}
          {nearestEvac && (
            <button
              type="button"
              onClick={() => setFlyTarget({ lat: nearestEvac.zone.evacuationCenterLat, lng: nearestEvac.zone.evacuationCenterLng })}
              className="pointer-events-auto absolute bottom-14 right-2 max-w-[180px] rounded-lg border-2 border-border bg-background/95 px-2.5 py-1.5 text-xs font-medium shadow-md backdrop-blur transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 shrink-0 text-teal-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12h4"></path><path d="M10 8h4"></path><path d="M14 21v-3a2 2 0 0 0-4 0v3"></path><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"></path><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"></path></svg>
                <div className="min-w-0">
                  <div className="truncate text-[10px] text-muted-foreground">{t(NEAREST_EVAC_LABEL, lang)}</div>
                  <div className="truncate font-medium">{nearestEvac.zone.evacuationCenterName}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {Math.round(nearestEvac.distance)}m
                    {nearestEvac.zone.evacuationCenterCapacity > 0 && (
                      <span className={nearestEvac.zone.currentOccupancy != null && nearestEvac.zone.currentOccupancy >= nearestEvac.zone.evacuationCenterCapacity ? "ml-1 text-red-500" : "ml-1 text-green-600"}>
                        {nearestEvac.zone.currentOccupancy != null && nearestEvac.zone.currentOccupancy >= nearestEvac.zone.evacuationCenterCapacity
                          ? t(EVAC_FULL, lang)
                          : t(EVAC_AVAILABLE, lang)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          )}

          <div className="pointer-events-auto absolute bottom-2 left-2">
            <HazardTypeSelector value={hazardType} onChange={onHazardTypeChange} />
          </div>
        </>
      }
    >
      {flyTarget && <FlyToUser position={flyTarget} />}
      {searchTarget && <FlyToTarget target={searchTarget} />}
      {isPlacingPin && onMapClickForPin && <PinPlacer onPlace={onMapClickForPin} />}
      <ViewportTracker onZoom={setZoom} onCenter={setViewCenter} />

      {showHazard && <HazardBackdropLayer zones={visibleZones} hazardType={hazardType} />}
      {showHistorical && <HistoricalEventsLayer zones={visibleZones} />}

        {showStatus && visibleZones.map((zone) => {
          const alert = alertMap.get(zone.id);
          const status = getZoneStatus(alert);
          const color = getZoneStatusColor(alert);
          const label = `${zone.name} — ${t(ZONE_STATUS_LABEL[status], lang)}`;
          return (
            <Marker
              key={`status-${zone.id}`}
              position={[zone.lat, zone.lng]}
              icon={createStatusMarkerIcon(status, color, label)}
              eventHandlers={{ click: () => onSelectZone(zone.id) }}
            >
              <Popup>
                <div className="space-y-1">
                  <p className="font-medium">{label}</p>
                  <a href="/evacuation" className="text-sm underline">
                    {t(VIEW_EVACUATION_DETAILS, lang)}
                  </a>
                </div>
              </Popup>
              {zoom >= 16 && status !== "safe" && (
                <Tooltip permanent direction="bottom" offset={[0, 8]} className="evac-label-tooltip">
                  <span className="text-[10px] font-medium">{t(ZONE_STATUS_LABEL[status], lang)}</span>
                </Tooltip>
              )}
            </Marker>
          );
        })}

        {evacVisible && showEvacCenters && evacClusters.map((cluster) => (
          <Marker
            key={`evac-cluster-${cluster.municipality}`}
            position={[cluster.lat, cluster.lng]}
            icon={createClusteredEvacMarkerIcon(cluster.municipality, cluster.count)}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <p className="font-medium">{cluster.municipality}</p>
                <p>{cluster.count} evacuation centers</p>
                {cluster.totalCapacity > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {cluster.totalOccupancy} / {cluster.totalCapacity} total capacity
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {evacVisible && individualEvacZones.map((zone) => {
          const ratio = zone.evacuationCenterCapacity > 0 && zone.currentOccupancy != null
            ? zone.currentOccupancy / zone.evacuationCenterCapacity
            : undefined;
          return (
            <Marker
              key={`evac-${zone.id}`}
              position={[zone.evacuationCenterLat, zone.evacuationCenterLng]}
              icon={createEvacuationMarkerIcon(zone.evacuationCenterName, ratio)}
            >
              <Popup>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{zone.evacuationCenterName}</p>
                  {zone.evacuationCenterCapacity > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {zone.currentOccupancy ?? 0} / {zone.evacuationCenterCapacity} capacity
                    </p>
                  )}
                </div>
              </Popup>
              {zoom >= 15 && (
                <Tooltip permanent direction="bottom" offset={[0, 8]} className="evac-label-tooltip">
                  <span className="text-[10px] font-medium">{zone.evacuationCenterName}</span>
                </Tooltip>
              )}
            </Marker>
          );
        })}

        {showPoi && <PoiMarkerLayer zones={visibleZones} zoom={zoom} />}

        {routeZone && effectiveRoutePolyline.length > 0 && (
          <Polyline
            positions={effectiveRoutePolyline}
            pathOptions={{
              color: routeHazard ? "#7f1d1d" : "#0f766e",
              weight: 4,
              dashArray: routeHazard ? "6 6" : undefined,
            }}
          />
        )}

        {showPins && communityPins.map((pin) => {
          const label = `${t(PIN_STATUS_LABEL[pin.statusTag], lang)} — ${t(UNVERIFIED_REPORT, lang)}`;
          const alreadyVoted = hasVotedOnPin(pin);
          const own = isOwnPin(pin, userId);
          return (
            <Marker
              key={pin.id}
              position={[pin.lat, pin.lng]}
              icon={createCommunityPinMarkerIcon(pin.statusTag, label)}
            >
              <Popup>
                <div className="space-y-1.5 text-sm">
                  <p className="font-medium">
                    {t(PIN_STATUS_LABEL[pin.statusTag], lang)}
                    {own && (
                      <span className="ml-2 rounded border border-border px-1 text-xs font-normal text-muted-foreground">
                        {t(YOUR_PIN, lang)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{t(UNVERIFIED_REPORT, lang)}</p>
                  {pin.caption && <p>{pin.caption}</p>}
                  {pin.photoDataUrl && (
                    <button
                      type="button"
                      onClick={() => onViewPhoto?.(pin)}
                      aria-label={t(VIEW_PHOTO, lang)}
                      className="block cursor-zoom-in"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- local/data URL, not a remote image next/image would optimize */}
                      <img
                        src={pin.photoDataUrl}
                        alt=""
                        className="h-20 w-auto rounded-md border-2 border-border object-cover"
                      />
                    </button>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={alreadyVoted}
                      onClick={() => voteOnPin(pin.id, 1)}
                      aria-label={t(UPVOTE, lang)}
                      className="rounded border-2 border-border px-2 py-0.5 text-xs font-medium disabled:opacity-50"
                    >
                      ▲ {pin.upvotes}
                    </button>
                    <button
                      type="button"
                      disabled={alreadyVoted}
                      onClick={() => voteOnPin(pin.id, -1)}
                      aria-label={t(DOWNVOTE, lang)}
                      className="rounded border-2 border-border px-2 py-0.5 text-xs font-medium disabled:opacity-50"
                    >
                      ▼ {pin.downvotes}
                    </button>
                  </div>
                  {alreadyVoted && <p className="text-xs text-muted-foreground">{t(ALREADY_VOTED, lang)}</p>}
                  {own && (
                    <div className="flex items-center gap-2 border-t pt-1.5">
                      <button
                        type="button"
                        onClick={() => onEditPin?.(pin)}
                        className="rounded border-2 border-border px-2 py-0.5 text-xs font-medium"
                      >
                        {t(EDIT_PIN, lang)}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePin?.(pin)}
                        className="rounded border-2 border-severity-red px-2 py-0.5 text-xs font-medium text-severity-red"
                      >
                        {t(DELETE_PIN, lang)}
                      </button>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {livePosition && (
          <Marker
            position={[livePosition.lat, livePosition.lng]}
            icon={createUserLocationIcon()}
            zIndexOffset={1000}
          >
            <Popup>{t(YOUR_LOCATION, lang)}</Popup>
          </Marker>
        )}
    </MapShell>
  );
}
