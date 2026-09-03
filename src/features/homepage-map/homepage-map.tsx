"use client";

import { useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, Polyline, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
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

const SAFEST_ROUTE_TO: LocalizedText = { en: "Safest route to", fil: "Pinakaligtas na ruta papunta sa" };
const PASSES_THROUGH_HAZARD: LocalizedText = {
  en: "This is the best available path, but it passes through a hazardous area.",
  fil: "Ito ang pinakamagandang ruta na available, pero dumadaan ito sa mapanganib na lugar.",
};
const DIRECTION_TO_SAFETY: LocalizedText = { en: "away", fil: "ang layo" };
const MAP_ARIA_LABEL: LocalizedText = {
  en: "Interactive flood zone map",
  fil: "Interactibong mapa ng flood zone",
};
const VIEW_EVACUATION_DETAILS: LocalizedText = {
  en: "View evacuation details",
  fil: "Tingnan ang detalye ng evacuation",
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

  return (
    <div className="grid w-full max-w-2xl gap-4 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <div className="lg:col-start-2 lg:row-start-1">
        <HazardTypeSelector value={hazardType} onChange={setHazardType} />
      </div>

      <div
        className="h-[400px] w-full overflow-hidden rounded-md border-2 border-border lg:col-start-1 lg:row-span-3 lg:h-[600px]"
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
                eventHandlers={{ click: () => setRouteZoneId(zone.id) }}
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
      </div>

      {routeZone && (
        <p lang={lang} className="text-sm lg:col-start-2 lg:row-start-2">
          {t(SAFEST_ROUTE_TO, lang)} {routeZone.evacuationCenterName}.{" "}
          {directionToSafety && (
            <span className="font-medium">
              {Math.round(directionToSafety.distanceMeters)}m{" "}
              {t(COMPASS_LABEL[directionToSafety.compassLabel], lang)} {t(DIRECTION_TO_SAFETY, lang)}.
            </span>
          )}{" "}
          {routeHazard && (
            <span className="rounded bg-severity-evacuate px-2 py-0.5 font-medium text-white">
              {t(PASSES_THROUGH_HAZARD, lang)}
            </span>
          )}
        </p>
      )}

      <div className="lg:col-start-2 lg:row-start-3">
        <MarkerLegend />
      </div>
    </div>
  );
}
