"use client";

import { useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, Polyline, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getActiveAlertForZone, getPOIsForZone, getHazardSusceptibilityForZone } from "@/lib/mock-data";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { hazardRiskColor } from "./hazard-color";
import { createStatusMarkerIcon, createPoiMarkerIcon, createEvacuationMarkerIcon } from "./marker-icons";
import { MarkerLegend } from "./marker-legend";
import { HazardTypeSelector } from "./hazard-type-selector";
import { getBearingAndDistance } from "./bearing-distance";
import { useLivePosition } from "./use-live-position";
import { routeCrossesHazard } from "./route-hazard";
import type { HazardType, LocalizedText, Zone } from "@/lib/types";

const TO: LocalizedText = { en: "to", fil: "papunta sa" };
const PASSES_THROUGH_HAZARD: LocalizedText = {
  en: "Passes through a hazardous area",
  fil: "Dumadaan sa mapanganib na lugar",
};
const MAP_ARIA_LABEL: LocalizedText = {
  en: "Interactive flood zone map",
  fil: "Interactibong mapa ng flood zone",
};
const VIEW_EVACUATION_DETAILS: LocalizedText = {
  en: "View evacuation details",
  fil: "Tingnan ang detalye ng evacuation",
};
const FIND_SAFE_AREA: LocalizedText = { en: "Find safe area", fil: "Hanapin ang ligtas na lugar" };
const FIND_SAFE_EVACUATION_CENTER: LocalizedText = {
  en: "Find safe evacuation center",
  fil: "Hanapin ang ligtas na evacuation center",
};
const NO_SAFE_AREA_FOUND: LocalizedText = {
  en: "No zone is currently Safe.",
  fil: "Walang zone na Ligtas sa ngayon.",
};
const NO_SAFE_ROUTE_FOUND: LocalizedText = {
  en: "Every route currently passes through a hazardous area.",
  fil: "Lahat ng ruta ay dumadaan sa mapanganib na lugar sa ngayon.",
};

/** Compass codes returned by `getBearingAndDistance` — Filipino uses distinct words, not abbreviations of the English letters. */
const COMPASS_LABEL: Record<string, LocalizedText> = {
  N: { en: "N", fil: "Hilaga" },
  NE: { en: "NE", fil: "Hilagang-Silangan" },
  E: { en: "E", fil: "Silangan" },
  SE: { en: "SE", fil: "Timog-Silangan" },
  S: { en: "S", fil: "Timog" },
  SW: { en: "SW", fil: "Timog-Kanluran" },
  W: { en: "W", fil: "Kanluran" },
  NW: { en: "NW", fil: "Hilagang-Kanluran" },
};

export function HomepageMap({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const [hazardType, setHazardType] = useState<HazardType>("flood");
  const [routeZoneId, setRouteZoneId] = useState<string | null>(zones[0]?.id ?? null);
  const [notice, setNotice] = useState<LocalizedText | null>(null);
  const livePosition = useLivePosition();

  const center: [number, number] = [zones[0].lat, zones[0].lng];
  const routeZone = zones.find((z) => z.id === routeZoneId) ?? null;
  const directionToSafety =
    routeZone && livePosition
      ? getBearingAndDistance(livePosition, {
          lat: routeZone.evacuationCenterLat,
          lng: routeZone.evacuationCenterLng,
        })
      : null;
  const routeHazard = routeZone ? routeCrossesHazard(routeZone, zones) : false;

  function handleFindSafeArea() {
    const safeZone = zones.find((z) => getZoneStatus(getActiveAlertForZone(z.id)) === "safe");
    if (safeZone) {
      setRouteZoneId(safeZone.id);
      setNotice(null);
    } else {
      setNotice(NO_SAFE_AREA_FOUND);
    }
  }

  function handleFindSafeEvacuationCenter() {
    const safeRouteZone = zones.find((z) => !routeCrossesHazard(z, zones));
    if (safeRouteZone) {
      setRouteZoneId(safeRouteZone.id);
      setNotice(null);
    } else {
      setNotice(NO_SAFE_ROUTE_FOUND);
    }
  }

  return (
    <div className="grid w-full max-w-2xl gap-3 sm:gap-4 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <div
        className="relative h-[340px] w-full overflow-hidden rounded-md border-2 border-border sm:h-[400px] lg:col-start-1 lg:row-span-2 lg:h-[600px]"
        aria-label={t(MAP_ARIA_LABEL, lang)}
      >
        <MapContainer center={center} zoom={14} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {zones.map((zone) => {
            const risk = getHazardSusceptibilityForZone(zone.id)[hazardType];
            return (
              <Circle
                key={`hazard-${zone.id}`}
                center={[zone.lat, zone.lng]}
                radius={500}
                pathOptions={{
                  color: hazardRiskColor(risk),
                  fillColor: hazardRiskColor(risk),
                  fillOpacity: 0.2,
                  opacity: 0.3,
                  weight: 1,
                }}
              />
            );
          })}

          {zones.map((zone) => {
            const alert = getActiveAlertForZone(zone.id);
            const status = getZoneStatus(alert);
            const color = getZoneStatusColor(alert);
            const label = `${zone.name} — ${t(ZONE_STATUS_LABEL[status], lang)}`;
            return (
              <Marker
                key={`status-${zone.id}`}
                position={[zone.lat, zone.lng]}
                icon={createStatusMarkerIcon(status, color, label)}
                eventHandlers={{
                  click: () => {
                    setRouteZoneId(zone.id);
                    setNotice(null);
                  },
                }}
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

          {zones.flatMap((zone) =>
            getPOIsForZone(zone.id).map((poi) => (
              <Marker
                key={poi.id}
                position={[poi.lat, poi.lng]}
                icon={createPoiMarkerIcon(poi.category, poi.name)}
              >
                <Popup>{poi.name}</Popup>
              </Marker>
            ))
          )}

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
        </MapContainer>

        <div className="pointer-events-none absolute inset-0 z-[1000] p-2">
          <div className="pointer-events-auto absolute top-2 right-2">
            <MarkerLegend />
          </div>
          <div className="pointer-events-auto absolute bottom-2 left-2">
            <HazardTypeSelector value={hazardType} onChange={setHazardType} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 lg:col-start-2 lg:row-start-1">
        <Button type="button" variant="outline" size="sm" onClick={handleFindSafeArea}>
          {t(FIND_SAFE_AREA, lang)}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleFindSafeEvacuationCenter}>
          {t(FIND_SAFE_EVACUATION_CENTER, lang)}
        </Button>
      </div>

      {(routeZone || notice) && (
        <p lang={lang} className="text-sm lg:col-start-2 lg:row-start-2">
          {routeZone && directionToSafety && (
            <span className="font-medium">
              {Math.round(directionToSafety.distanceMeters)}m{" "}
              {t(COMPASS_LABEL[directionToSafety.compassLabel], lang)} {t(TO, lang)}{" "}
              {routeZone.evacuationCenterName}
            </span>
          )}{" "}
          {routeZone && routeHazard && (
            <span className="rounded bg-severity-evacuate px-2 py-0.5 font-medium text-white">
              {t(PASSES_THROUGH_HAZARD, lang)}
            </span>
          )}
          {notice && <span className="text-muted-foreground">{t(notice, lang)}</span>}
        </p>
      )}
    </div>
  );
}
