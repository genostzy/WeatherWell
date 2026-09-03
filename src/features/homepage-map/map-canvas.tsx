"use client";

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
import type { HazardType, LocalizedText, Zone } from "@/lib/types";

const MAP_ARIA_LABEL: LocalizedText = {
  en: "Interactive flood zone map",
  fil: "Interactibong mapa ng flood zone",
};
const VIEW_EVACUATION_DETAILS: LocalizedText = {
  en: "View evacuation details",
  fil: "Tingnan ang detalye ng evacuation",
};

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
}: {
  zones: Zone[];
  hazardType: HazardType;
  onHazardTypeChange: (type: HazardType) => void;
  routeZone: Zone | null;
  routeHazard: boolean;
  onSelectZone: (zoneId: string) => void;
}) {
  const { lang } = useLanguage();
  const center: [number, number] = [zones[0].lat, zones[0].lng];

  return (
    <div
      className="relative h-[340px] w-full overflow-hidden rounded-md border-2 border-border sm:h-[400px] lg:h-[600px]"
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
          <HazardTypeSelector value={hazardType} onChange={onHazardTypeChange} />
        </div>
      </div>
    </div>
  );
}
