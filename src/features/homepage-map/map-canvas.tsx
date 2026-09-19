"use client";

import { useEffect, useState } from "react";
import { Marker, Polyline, Popup, useMapEvents, useMap } from "react-leaflet";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { useAlerts } from "@/lib/alerts-store";
import { useCommunityPins, voteOnPin, hasVotedOnPin, isOwnPin, type CommunityPin } from "@/lib/community-pins";
import { useSessionUserId } from "@/lib/auth/anonymous-session";
import { PIN_STATUS_LABEL } from "@/lib/community-pin";
import { MapShell } from "@/features/map/map-shell";
import { HazardBackdropLayer } from "@/features/map/hazard-backdrop-layer";
import { PoiMarkerLayer } from "@/features/map/poi-marker-layer";
import {
  createStatusMarkerIcon,
  createEvacuationMarkerIcon,
  createCommunityPinMarkerIcon,
  createUserLocationIcon,
} from "@/features/map/marker-icons";
import { MarkerLegend } from "@/features/map/marker-legend";
import { HazardTypeSelector } from "@/features/map/hazard-type-selector";
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
const TAP_MAP_TO_PLACE: LocalizedText = {
  en: "Tap the map to drop your pin",
  fil: "Pindutin ang mapa para ilagay ang pin",
};
const LOCATE_ME: LocalizedText = { en: "Locate me", fil: "Hanapin ako" };
const YOUR_LOCATION: LocalizedText = { en: "Your location", fil: "Iyong lokasyon" };

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

/**
 * Tracks the current map zoom level and re-renders when it changes.
 * Must be rendered inside <MapContainer> (a child of MapShell).
 */
function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    onZoom(map.getZoom());
    const handler = () => onZoom(map.getZoom());
    map.on("zoomend", handler);
    return () => { map.off("zoomend", handler); };
  }, [map, onZoom]);
  return null;
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
}) {
  const { lang } = useLanguage();
  const communityPins = useCommunityPins();
  const userId = useSessionUserId();
  const alerts = useAlerts();
  const center: [number, number] = [zones[0].lat, zones[0].lng];
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState(14);

  /**
   * Zoom-adaptive marker culling. At lower zooms the map covers a huge area
   * but should only render a handful of markers to stay responsive.
   * As the user zooms in, both the radius and the cap increase so the
   * neighbourhood fills in naturally.
   *
   * Radius: 0.02° (~2 km) at zoom 10 → 0.25° (~25 km) at zoom 15+.
   * Cap:    20 markers at zoom ≤11 → 300 at zoom 14+.
   */
  const radiusDeg = Math.min(0.25, 0.004 * Math.pow(2, Math.max(zoom - 10, 0)));
  const markerCap = zoom <= 11 ? 20 : zoom <= 12 ? 60 : zoom <= 13 ? 150 : 300;

  const visibleZones = zones
    .filter(
      (z) =>
        Math.abs(z.lat - center[0]) < radiusDeg &&
        Math.abs(z.lng - center[1]) < radiusDeg
    )
    .slice(0, markerCap);

  // Evac centers only appear at close zoom to avoid double-clutter.
  const showEvacCenters = zoom >= 15;

  return (
    <MapShell
      center={center}
      ariaLabel={t(MAP_ARIA_LABEL, lang)}
      className={isPlacingPin ? "cursor-crosshair" : ""}
      overlay={
        <>
          <div className="pointer-events-auto absolute top-2 right-2">
            <MarkerLegend />
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
          <div className="pointer-events-auto absolute bottom-2 left-2">
            <HazardTypeSelector value={hazardType} onChange={onHazardTypeChange} />
          </div>
          {isPlacingPin && (
            <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-md border-2 border-border bg-background/95 px-3 py-1 text-xs font-medium shadow-md">
              {t(TAP_MAP_TO_PLACE, lang)}
            </div>
          )}
        </>
      }
    >
      {flyTarget && <FlyToUser position={flyTarget} />}
      {isPlacingPin && onMapClickForPin && <PinPlacer onPlace={onMapClickForPin} />}
      <ZoomTracker onZoom={setZoom} />

      <HazardBackdropLayer zones={visibleZones} hazardType={hazardType} />

        {visibleZones.map((zone) => {
          const alert = alerts.find((a) => a.zoneId === zone.id && a.isActive);
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
            </Marker>
          );
        })}

        {showEvacCenters && visibleZones.map((zone) => (
          <Marker
            key={`evac-${zone.id}`}
            position={[zone.evacuationCenterLat, zone.evacuationCenterLng]}
            icon={createEvacuationMarkerIcon(zone.evacuationCenterName)}
          >
            <Popup>{zone.evacuationCenterName}</Popup>
          </Marker>
        ))}

        <PoiMarkerLayer zones={visibleZones} />

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

        {communityPins.map((pin) => {
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
