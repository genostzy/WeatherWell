"use client";

import { useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, Polyline, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getActiveAlertForZone, getPOIsForZone, getHazardSusceptibilityForZone } from "@/lib/mock-data";
import { getZoneStatus, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { hazardRiskColor } from "./hazard-color";
import { createStatusMarkerIcon, createPoiMarkerIcon, createEvacuationMarkerIcon } from "./marker-icons";
import { MarkerLegend } from "./marker-legend";
import { HazardTypeSelector } from "./hazard-type-selector";
import { getBearingAndDistance } from "./bearing-distance";
import { useLivePosition } from "./use-live-position";
import type { HazardType, LocalizedText, Zone } from "@/lib/types";

const HAZARD_ZONE_STATUSES = new Set(["dangerous", "hazardous"]);

const SAFEST_ROUTE_TO: LocalizedText = { en: "Safest route to", fil: "Pinakaligtas na ruta papunta sa" };
const PASSES_THROUGH_HAZARD: LocalizedText = {
  en: "This is the best available path, but it passes through a hazardous area.",
  fil: "Ito ang pinakamagandang ruta na available, pero dumadaan ito sa mapanganib na lugar.",
};
const DIRECTION_TO_SAFETY: LocalizedText = { en: "away", fil: "ang layo" };

export function HomepageMap({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const [hazardType, setHazardType] = useState<HazardType>("flood");
  const [routeZoneId, setRouteZoneId] = useState<string | null>(null);
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
  const routeCrossesHazard = routeZone
    ? zones.some(
        (z) =>
          HAZARD_ZONE_STATUSES.has(getZoneStatus(getActiveAlertForZone(z.id))) &&
          z.id !== routeZone.id &&
          routeZone.evacuationRoutePath.some(
            ([lat, lng]) => Math.abs(lat - z.lat) < 0.003 && Math.abs(lng - z.lng) < 0.003
          )
      )
    : false;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <HazardTypeSelector value={hazardType} onChange={setHazardType} />

      <div className="h-[400px] w-full overflow-hidden rounded-md border-2 border-border">
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
            const label = `${zone.name} — ${t(ZONE_STATUS_LABEL[status], lang)}`;
            return (
              <Marker
                key={`status-${zone.id}`}
                position={[zone.lat, zone.lng]}
                icon={createStatusMarkerIcon(status, label)}
                eventHandlers={{ click: () => setRouteZoneId(zone.id) }}
              >
                <Popup>{label}</Popup>
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
                color: routeCrossesHazard ? "#7f1d1d" : "#0f766e",
                weight: 4,
                dashArray: routeCrossesHazard ? "6 6" : undefined,
              }}
            />
          )}
        </MapContainer>
      </div>

      {routeZone && (
        <p lang={lang} className="text-sm">
          {t(SAFEST_ROUTE_TO, lang)} {routeZone.evacuationCenterName}.{" "}
          {directionToSafety && (
            <span className="font-medium">
              {Math.round(directionToSafety.distanceMeters)}m {directionToSafety.compassLabel}{" "}
              {t(DIRECTION_TO_SAFETY, lang)}.
            </span>
          )}{" "}
          {routeCrossesHazard && (
            <span className="font-medium text-severity-evacuate">
              {t(PASSES_THROUGH_HAZARD, lang)}
            </span>
          )}
        </p>
      )}

      <MarkerLegend />
    </div>
  );
}
