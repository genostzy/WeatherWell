"use client";

import { useState } from "react";
import { Marker, Polyline, Popup } from "react-leaflet";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { MOCK_CASCADES } from "@/lib/mock-data";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { SEVERITY_ORDER, SEVERITY_LABEL, type Severity } from "@/lib/severity";
import { CENTER_STATUS_LABEL, resolveEffectiveCenterStatus } from "@/lib/center-status";
import { useAlerts } from "@/lib/alerts-store";
import {
  useAllCommunityPins,
  removePinByAdmin,
  restoreCommunityPin,
} from "@/lib/community-pins";
import { PIN_STATUS_LABEL } from "@/lib/community-pin";
import { buildZoneInputForZone, computeZoneState } from "@/lib/risk-engine/score";
import { useHazards } from "@/lib/reference-data/use-reference-data";
import { useManagesZone } from "@/lib/auth/official-context";
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
import type { AlertRecord, HazardType, LanguageCode, LocalizedText, Zone } from "@/lib/types";

const MAP_ARIA_LABEL: LocalizedText = {
  en: "Admin operations map",
  fil: "Mapa ng operasyon ng admin",
};
const ALERT_SEVERITY: LocalizedText = { en: "Alert severity", fil: "Severity ng alerto" };
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
/** No reason recorded means the author withdrew it themselves — see deleteOwnPin. */
const REMOVED_BY_AUTHOR: LocalizedText = { en: "withdrawn by author", fil: "inalis ng may-akda" };
const LAYERS: LocalizedText = { en: "Layers", fil: "Mga layer" };
const LAYER_HAZARD: LocalizedText = { en: "Hazard backdrop", fil: "Hazard backdrop" };
const LAYER_PINS: LocalizedText = { en: "Community pins", fil: "Community pins" };
const LAYER_POIS: LocalizedText = { en: "Essential services", fil: "Mahahalagang serbisyo" };
const LAYER_CASCADE: LocalizedText = { en: "Cascade chain", fil: "Cascade chain" };
const CASCADE_LINE_COLOR = "#8b5cf6";
const SAVE_FAILED: LocalizedText = { en: "Could not save — try again.", fil: "Hindi na-save — subukan ulit." };
const VIEW_ONLY: LocalizedText = { en: "View only", fil: "Tingnan lang" };

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
  const allPins = useAllCommunityPins();
  const hazards = useHazards();
  const managesZone = useManagesZone();
  const alerts = useAlerts();
  const baseAlertFor = (zoneId: string) => alerts.find((a) => a.zoneId === zoneId && a.isActive);
  const [hazardType, setHazardType] = useState<HazardType>("flood");
  const [layers, setLayers] = useState<LayerVisibility>({
    hazard: true,
    pins: true,
    pois: true,
    cascade: true,
  });

  const center: [number, number] = [zones[0].lat, zones[0].lng];
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));

  /** The risk score's cascade factor must follow the zone's actual alert. */
  const hasEffectiveAlert = (zoneId: string) => baseAlertFor(zoneId) !== undefined;

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
        const alert = baseAlertFor(zone.id);
        const status = getZoneStatus(alert);
        const label = `${zone.name} — ${t(ZONE_STATUS_LABEL[status], lang)}`;
        const riskScore = computeZoneState(
          buildZoneInputForZone(zone, zones, hasEffectiveAlert, hazards)
        ).riskScore;
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

                <ZoneAlertSelect zone={zone} alert={alert} lang={lang} canManage={managesZone(zone)} />
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
          <Popup>
            <div className="space-y-2 text-sm">
              <p className="font-medium">{zone.evacuationCenterName}</p>
              <CenterOccupancyControl zone={zone} lang={lang} canManage={managesZone(zone)} />
            </div>
          </Popup>
        </Marker>
      ))}

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
                      {t(
                        pin.removedReason === "admin"
                          ? REMOVED_BY_ADMIN
                          : pin.removedReason === "net_score"
                            ? REMOVED_BY_VOTES
                            : REMOVED_BY_AUTHOR,
                        lang
                      )}
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

/**
 * The alert-severity control for one zone's marker popup. Its own component
 * (not inline in AdminMapCanvas's zones.map()) so its pending-error state is
 * a real useState call at the top of a component body, not a hook called
 * from inside a loop.
 *
 * A native select rather than the shadcn one: Radix renders its listbox in a
 * portal, which fights a Leaflet popup's own positioning and stacking.
 * Admin-only surface, so the plain control is the safer trade.
 */
function ZoneAlertSelect({
  zone,
  alert,
  lang,
  canManage,
}: {
  zone: Zone;
  alert: AlertRecord | undefined;
  lang: LanguageCode;
  canManage: boolean;
}) {
  const [error, setError] = useState(false);

  // Dynamic import, not a static one: set-zone-alert.ts is a "use server"
  // module that transitively imports "server-only", which throws if it is
  // ever evaluated outside a server bundle. A static import here would pull
  // it into every test that merely renders this component; the dynamic
  // import defers that to the moment an admin actually changes the select.
  async function handleChange(value: Severity | "none") {
    setError(false);
    const { setZoneAlert } = await import("@/app/actions/set-zone-alert");
    const result = await setZoneAlert({ zoneId: zone.id, severity: value });
    if (!result.ok) setError(true);
  }

  if (!canManage) {
    return (
      <p className="space-y-1">
        <span className="text-xs font-medium">{t(ALERT_SEVERITY, lang)}</span>
        <span className="block text-xs text-muted-foreground">{t(VIEW_ONLY, lang)}</span>
      </p>
    );
  }

  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium">{t(ALERT_SEVERITY, lang)}</span>
      <select
        value={alert?.severity ?? "none"}
        onChange={(event) => void handleChange(event.target.value as Severity | "none")}
        aria-label={`${t(ALERT_SEVERITY, lang)} — ${zone.name}`}
        className="w-full rounded-md border-2 border-border bg-background px-2 py-1 text-sm"
      >
        <option value="none">{t(CLEAR_NO_ALERT, lang)}</option>
        {SEVERITY_ORDER.map((severity: Severity) => (
          <option key={severity} value={severity}>
            {t(SEVERITY_LABEL[severity], lang)}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-severity-red">{t(SAVE_FAILED, lang)}</p>}
    </label>
  );
}

/**
 * The headcount control for one zone's evacuation-center popup — its own
 * component for the same reason ZoneAlertSelect is: a per-marker useState
 * call must not live inside AdminMapCanvas's zones.map().
 *
 * The typed headcount is seeded from zone.currentOccupancy (the last value
 * carried through /api/zones) and then tracked in this component's own
 * state as the admin edits it — a write doesn't itself refetch reference
 * data, so this state only reflects the server again after the next
 * fetch/reload. Typing here still derives the status shown below
 * immediately and writes it to the database via setCenterOccupancy.
 */
function CenterOccupancyControl({
  zone,
  lang,
  canManage,
}: {
  zone: Zone;
  lang: LanguageCode;
  canManage: boolean;
}) {
  const [occupancy, setOccupancy] = useState<number | undefined>(zone.currentOccupancy);
  const [error, setError] = useState(false);
  const centerStatus = resolveEffectiveCenterStatus(zone.centerStatus, zone.evacuationCenterCapacity, occupancy);

  // Dynamic import for the same reason ZoneAlertSelect's does: set-center.ts
  // is a "use server" module and must not be pulled statically into a
  // client-component test's module graph.
  async function handleChange(raw: string) {
    const value = raw === "" ? undefined : Number(raw);
    setOccupancy(value);
    setError(false);
    const { setCenterOccupancy } = await import("@/app/actions/set-center");
    const result = await setCenterOccupancy({ zoneId: zone.id, occupancy: value ?? null });
    if (!result.ok) setError(true);
  }

  if (!canManage) {
    return (
      <p className="text-xs text-muted-foreground">
        {t(CENTER_STATUS_LABEL[centerStatus], lang)}
        {occupancy !== undefined &&
          ` · ${Math.max(0, zone.evacuationCenterCapacity - occupancy)} ${t(SPOTS_LEFT, lang)}`}
        {" — "}
        {t(VIEW_ONLY, lang)}
      </p>
    );
  }

  return (
    <>
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
          onChange={(event) => void handleChange(event.target.value)}
          aria-label={`${t(HEADCOUNT, lang)} — ${zone.evacuationCenterName}`}
          className="w-full rounded-md border-2 border-border bg-background px-2 py-1 text-sm"
        />
      </label>
      {error && <p className="text-xs text-severity-red">{t(SAVE_FAILED, lang)}</p>}
    </>
  );
}
