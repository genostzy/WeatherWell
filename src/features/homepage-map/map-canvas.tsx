"use client";

import { Marker, Polyline, Popup, useMapEvents } from "react-leaflet";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { useZoneOverrides, resolveEffectiveAlert } from "@/lib/zone-overrides";
import { useCommunityPins, voteOnPin, hasVotedOnPin, isOwnPin, type CommunityPin } from "@/lib/community-pins";
import { PIN_STATUS_LABEL } from "@/lib/community-pin";
import { MapShell } from "@/features/map/map-shell";
import { HazardBackdropLayer } from "@/features/map/hazard-backdrop-layer";
import { PoiMarkerLayer } from "@/features/map/poi-marker-layer";
import {
  createStatusMarkerIcon,
  createEvacuationMarkerIcon,
  createCommunityPinMarkerIcon,
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

/** Only mounted while `isPlacingPin` — reports the resident's tap back up without adding a permanent click handler to the whole map. */
function PinPlacer({ onPlace }: { onPlace: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPlace(event.latlng.lat, event.latlng.lng);
    },
  });
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
  onSelectZone,
  isPlacingPin = false,
  onMapClickForPin,
  onEditPin,
  onDeletePin,
  onViewPhoto,
}: {
  zones: Zone[];
  hazardType: HazardType;
  onHazardTypeChange: (type: HazardType) => void;
  routeZone: Zone | null;
  routeHazard: boolean;
  onSelectZone: (zoneId: string) => void;
  isPlacingPin?: boolean;
  onMapClickForPin?: (lat: number, lng: number) => void;
  onEditPin?: (pin: CommunityPin) => void;
  onDeletePin?: (pin: CommunityPin) => void;
  onViewPhoto?: (pin: CommunityPin) => void;
}) {
  const { lang } = useLanguage();
  const overrides = useZoneOverrides();
  const communityPins = useCommunityPins();
  const center: [number, number] = [zones[0].lat, zones[0].lng];

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
      {isPlacingPin && onMapClickForPin && <PinPlacer onPlace={onMapClickForPin} />}

      <HazardBackdropLayer zones={zones} hazardType={hazardType} />

        {zones.map((zone) => {
          const alert = resolveEffectiveAlert(zone.id, overrides[zone.id]?.alertSeverity);
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

        {zones.map((zone) => (
          <Marker
            key={`evac-${zone.id}`}
            position={[zone.evacuationCenterLat, zone.evacuationCenterLng]}
            icon={createEvacuationMarkerIcon(zone.evacuationCenterName)}
          >
            <Popup>{zone.evacuationCenterName}</Popup>
          </Marker>
        ))}

        <PoiMarkerLayer zones={zones} />

        {routeZone && (
          <Polyline
            positions={routeZone.evacuationRoutePath}
            pathOptions={{
              color: routeHazard ? "#7f1d1d" : "#0f766e",
              weight: 4,
              dashArray: routeHazard ? "6 6" : undefined,
            }}
          />
        )}

        {communityPins.map((pin) => {
          const label = `${t(PIN_STATUS_LABEL[pin.statusTag], lang)} — ${t(UNVERIFIED_REPORT, lang)}`;
          const alreadyVoted = hasVotedOnPin(pin.id);
          const own = isOwnPin(pin);
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
    </MapShell>
  );
}
