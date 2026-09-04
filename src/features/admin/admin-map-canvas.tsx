"use client";

import { useState } from "react";
import { Marker, Polyline, Popup } from "react-leaflet";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { MOCK_CASCADES } from "@/lib/mock-data";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { SEVERITY_ORDER, SEVERITY_LABEL, type Severity } from "@/lib/severity";
import { CENTER_STATUS_LABEL } from "@/lib/center-status";
import {
  useZoneOverrides,
  resolveEffectiveAlert,
  resolveEffectiveCenterStatus,
  setZoneAlertOverride,
  setZoneOccupancyOverride,
  type AlertOverrideValue,
} from "@/lib/zone-overrides";
import {
  useAllCommunityPins,
  removePinByAdmin,
  restoreCommunityPin,
} from "@/lib/community-pins";
import { PIN_STATUS_LABEL } from "@/lib/community-pin";
import { buildZoneInputForZone, computeZoneState } from "@/lib/risk-engine/score";
import { MapShell } from "@/features/map/map-shell";
import { HazardBackdropLayer } from "@/features/map/hazard-backdrop-layer";
import { PoiMarkerLayer } from "@/features/map/poi-marker-layer";
import { MarkerLegend } from "@/features/map/marker-legend";
import { HazardTypeSelector } from "@/features/map/hazard-type-selector";
import {
  createStatusMarkerIcon,
  createEvacuationMarkerIcon,
  createCommunityPinMarkerIcon,
} from "@/features/map/marker-icons";
import type { HazardType, LocalizedText, Zone } from "@/lib/types";

const MAP_ARIA_LABEL: LocalizedText = {
  en: "Admin operations map",
  fil: "Mapa ng operasyon ng admin",
};
const ALERT_SEVERITY: LocalizedText = { en: "Alert severity", fil: "Severity ng alerto" };
const AUTOMATIC: LocalizedText = { en: "Automatic (from reports)", fil: "Awtomatiko (mula sa ulat)" };
const CLEAR_NO_ALERT: LocalizedText = { en: "Clear — no alert", fil: "Ligtas — walang alerto" };
const RISK_SCORE: LocalizedText = { en: "Risk score", fil: "Risk score" };
const ADVISORY_ONLY: LocalizedText = { en: "advisory only", fil: "payo lamang" };
const HEADCOUNT: LocalizedText = { en: "Headcount", fil: "Bilang ng tao" };
const SPOTS_LEFT: LocalizedText = { en: "spots left", fil: "espasyong natitira" };
const OF: LocalizedText = { en: "of", fil: "sa" };
const REMOVE_PIN: LocalizedText = { en: "Remove pin", fil: "Alisin ang pin" };
const RESTORE_PIN: LocalizedText = { en: "Restore pin", fil: "Ibalik ang pin" };
const REMOVED: LocalizedText = { en: "Removed", fil: "Naalis" };
const REMOVED_BY_VOTES: LocalizedText = { en: "removed by net score", fil: "naalis dahil sa net score" };
const REMOVED_BY_ADMIN: LocalizedText = { en: "removed by admin", fil: "inalis ng admin" };
const LAYERS: LocalizedText = { en: "Layers", fil: "Mga layer" };
const LAYER_HAZARD: LocalizedText = { en: "Hazard backdrop", fil: "Hazard backdrop" };
const LAYER_PINS: LocalizedText = { en: "Community pins", fil: "Community pins" };
const LAYER_POIS: LocalizedText = { en: "Essential services", fil: "Mahahalagang serbisyo" };
const LAYER_CASCADE: LocalizedText = { en: "Cascade chain", fil: "Cascade chain" };
const CASCADE_LINE_COLOR = "#8b5cf6";

/** "auto" means no override at all — distinct from "none", which actively clears a zone's alert. */
type SeveritySelectValue = AlertOverrideValue | "auto";

interface LayerVisibility {
  hazard: boolean;
  pins: boolean;
  pois: boolean;
  cascade: boolean;
}

/**
 * The admin counterpart to the resident MapCanvas: same shell, tiles, hazard
 * backdrop and POI layer, but every marker's popup is a control rather than a
 * read-only detail.
 *
 * It exists because three admin jobs are genuinely spatial and the list panels
 * on /admin throw that context away: judging whether a community pin is
 * plausible depends on where it sits, deciding which evacuation center to
 * redirect to depends on which full centers are near which flooded zones, and
 * the upstream→downstream cascade chain is a shape on a map rather than a row
 * in a table.
 */
export function AdminMapCanvas({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const overrides = useZoneOverrides();
  const allPins = useAllCommunityPins();
  const [hazardType, setHazardType] = useState<HazardType>("flood");
  const [layers, setLayers] = useState<LayerVisibility>({
    hazard: true,
    pins: true,
    pois: true,
    cascade: true,
  });

  const center: [number, number] = [zones[0].lat, zones[0].lng];
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));

  function toggleLayer(key: keyof LayerVisibility) {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <MapShell
      center={center}
      ariaLabel={t(MAP_ARIA_LABEL, lang)}
      overlay={
        <>
          <div className="pointer-events-auto absolute top-2 right-2">
            <MarkerLegend />
          </div>
          <div className="pointer-events-auto absolute bottom-2 left-2 space-y-2">
            <HazardTypeSelector value={hazardType} onChange={setHazardType} />
            <fieldset className="w-fit rounded-md border-2 border-border bg-background/95 p-2 text-xs shadow-md">
              <legend className="px-1 font-semibold">{t(LAYERS, lang)}</legend>
              {(
                [
                  ["hazard", LAYER_HAZARD],
                  ["pins", LAYER_PINS],
                  ["pois", LAYER_POIS],
                  ["cascade", LAYER_CASCADE],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 py-0.5">
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() => toggleLayer(key)}
                    className="h-3.5 w-3.5"
                  />
                  <span>{t(label, lang)}</span>
                </label>
              ))}
            </fieldset>
          </div>
        </>
      }
    >
      {layers.hazard && <HazardBackdropLayer zones={zones} hazardType={hazardType} />}
      {layers.pois && <PoiMarkerLayer zones={zones} />}

      {/* Upstream → downstream propagation, drawn between zone centres. Only
          meaningful on a map: the list panels state the relationship in words
          but can't show that zone-1 sits upriver of zone-2. */}
      {layers.cascade &&
        MOCK_CASCADES.map((cascade) => {
          const from = zoneById.get(cascade.fromZoneId);
          const to = zoneById.get(cascade.toZoneId);
          if (!from || !to) return null;
          return (
            <Polyline
              key={`cascade-${cascade.fromZoneId}-${cascade.toZoneId}`}
              positions={[
                [from.lat, from.lng],
                [to.lat, to.lng],
              ]}
              pathOptions={{ color: CASCADE_LINE_COLOR, weight: 3, dashArray: "8 6", opacity: 0.8 }}
            />
          );
        })}

      {zones.map((zone) => {
        const override = overrides[zone.id]?.alertSeverity;
        const alert = resolveEffectiveAlert(zone.id, override);
        const status = getZoneStatus(alert);
        const label = `${zone.name} — ${t(ZONE_STATUS_LABEL[status], lang)}`;
        const riskScore = computeZoneState(buildZoneInputForZone(zone, zones)).riskScore;
        return (
          <Marker
            key={`status-${zone.id}`}
            position={[zone.lat, zone.lng]}
            icon={createStatusMarkerIcon(status, getZoneStatusColor(alert), label)}
          >
            <Popup>
              <div className="space-y-2 text-sm">
                <p className="font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {t(RISK_SCORE, lang)}: <span className="font-semibold">{riskScore}</span>/100 —{" "}
                  {t(ADVISORY_ONLY, lang)}
                </p>

                {/* A native select rather than the shadcn one: Radix renders its
                    listbox in a portal, which fights a Leaflet popup's own
                    positioning and stacking. Admin-only surface, so the plain
                    control is the safer trade. */}
                <label className="block space-y-1">
                  <span className="text-xs font-medium">{t(ALERT_SEVERITY, lang)}</span>
                  <select
                    value={override ?? "auto"}
                    onChange={(event) => {
                      const value = event.target.value as SeveritySelectValue;
                      setZoneAlertOverride(zone.id, value === "auto" ? undefined : value);
                    }}
                    aria-label={`${t(ALERT_SEVERITY, lang)} — ${zone.name}`}
                    className="w-full rounded-md border-2 border-border bg-background px-2 py-1 text-sm"
                  >
                    <option value="auto">{t(AUTOMATIC, lang)}</option>
                    <option value="none">{t(CLEAR_NO_ALERT, lang)}</option>
                    {SEVERITY_ORDER.map((severity: Severity) => (
                      <option key={severity} value={severity}>
                        {t(SEVERITY_LABEL[severity], lang)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {zones.map((zone) => {
        const occupancy = overrides[zone.id]?.currentOccupancy;
        const centerStatus = resolveEffectiveCenterStatus(
          zone.centerStatus,
          overrides[zone.id]?.centerStatus,
          zone.evacuationCenterCapacity,
          occupancy
        );
        return (
          <Marker
            key={`evac-${zone.id}`}
            position={[zone.evacuationCenterLat, zone.evacuationCenterLng]}
            icon={createEvacuationMarkerIcon(zone.evacuationCenterName)}
          >
            <Popup>
              <div className="space-y-2 text-sm">
                <p className="font-medium">{zone.evacuationCenterName}</p>
                <p className="text-xs text-muted-foreground">
                  {t(CENTER_STATUS_LABEL[centerStatus], lang)}
                  {occupancy !== undefined &&
                    ` · ${Math.max(0, zone.evacuationCenterCapacity - occupancy)} ${t(SPOTS_LEFT, lang)}`}
                </p>
                <label className="block space-y-1">
                  <span className="text-xs font-medium">
                    {t(HEADCOUNT, lang)} ({t(OF, lang)} {zone.evacuationCenterCapacity})
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={zone.evacuationCenterCapacity}
                    value={occupancy ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setZoneOccupancyOverride(zone.id, raw === "" ? undefined : Number(raw));
                    }}
                    aria-label={`${t(HEADCOUNT, lang)} — ${zone.evacuationCenterName}`}
                    className="w-full rounded-md border-2 border-border bg-background px-2 py-1 text-sm"
                  />
                </label>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Reads useAllCommunityPins, not useCommunityPins: a removed pin has to
          stay visible here or there'd be no way to restore one that voting took
          down wrongly (PRD Core Feature #5's "remove or restore any pin"). */}
      {layers.pins &&
        allPins.map((pin) => {
          const statusLabel = t(PIN_STATUS_LABEL[pin.statusTag], lang);
          const label = pin.removed ? `${statusLabel} — ${t(REMOVED, lang)}` : statusLabel;
          return (
            <Marker
              key={pin.id}
              position={[pin.lat, pin.lng]}
              icon={createCommunityPinMarkerIcon(pin.statusTag, label)}
              opacity={pin.removed ? 0.5 : 1}
            >
              <Popup>
                <div className="space-y-1.5 text-sm">
                  <p className="font-medium">{statusLabel}</p>
                  {pin.removed && (
                    <p className="text-xs font-medium text-severity-red">
                      {t(REMOVED, lang)} —{" "}
                      {t(pin.removedReason === "admin" ? REMOVED_BY_ADMIN : REMOVED_BY_VOTES, lang)}
                    </p>
                  )}
                  {pin.caption && <p>{pin.caption}</p>}
                  {pin.photoDataUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element -- local/data URL, not a remote image next/image would optimize */
                    <img
                      src={pin.photoDataUrl}
                      alt=""
                      className="h-20 w-auto rounded-md border-2 border-border object-cover"
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    ▲ {pin.upvotes} · ▼ {pin.downvotes}
                  </p>
                  <button
                    type="button"
                    onClick={() => (pin.removed ? restoreCommunityPin(pin.id) : removePinByAdmin(pin.id))}
                    className={`rounded border-2 px-2 py-0.5 text-xs font-medium ${
                      pin.removed ? "border-border" : "border-severity-red text-severity-red"
                    }`}
                  >
                    {t(pin.removed ? RESTORE_PIN : REMOVE_PIN, lang)}
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
    </MapShell>
  );
}
