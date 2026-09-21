"use client";

import { useMemo, useState } from "react";
import { Marker, Polyline, Popup, useMapEvents } from "react-leaflet";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { MOCK_CASCADES } from "@/lib/mock-data";
import { getZoneStatus, getZoneStatusColor, ZONE_STATUS_LABEL } from "@/lib/zone-status";
import { SEVERITY_ORDER, SEVERITY_LABEL, type Severity } from "@/lib/severity";
import { CENTER_STATUS_LABEL, resolveEffectiveCenterStatus } from "@/lib/center-status";
import { useAlerts, useSetZoneAlert } from "@/lib/alerts-store";
import {
  useAllCommunityPins,
  removePinByAdmin,
  restoreCommunityPin,
  type CommunityPin,
} from "@/lib/community-pins";
import { useOutbox } from "@/lib/outbox/outbox";
import { PIN_STATUS_LABEL } from "@/lib/community-pin";
import { buildZoneInputForZone, computeZoneState } from "@/lib/risk-engine/score";
import { useHazards } from "@/lib/reference-data/use-reference-data";
import { useManagesZone } from "@/lib/auth/official-context";
import {
  useOfficialMarkers,
  OFFICIAL_MARKER_TYPES,
  OFFICIAL_MARKER_LABEL,
  type OfficialMarkerType,
} from "@/lib/official-markers";
import { useSessionUserId } from "@/lib/auth/anonymous-session";
import { MapShell } from "@/features/map/map-shell";
import { ViewportTracker, viewportRadiusDeg, viewportMarkerCap } from "@/features/map/viewport-tracker";
import { HazardBackdropLayer } from "@/features/map/hazard-backdrop-layer";
import { PoiMarkerLayer } from "@/features/map/poi-marker-layer";
import { MarkerLegend } from "@/features/map/marker-legend";
import { HazardTypeSelector } from "@/features/map/hazard-type-selector";
import {
  createStatusMarkerIcon,
  createEvacuationMarkerIcon,
  createCommunityPinMarkerIcon,
  createOfficialMarkerIcon,
} from "@/features/map/marker-icons";
import type { AlertRecord, HazardType, LanguageCode, LocalizedText, Zone } from "@/lib/types";
import { useHeadcountCommit } from "./use-headcount-commit";

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
const LAYER_OFFICIAL: LocalizedText = { en: "Official markers", fil: "Official marker" };
const CASCADE_LINE_COLOR = "#8b5cf6";
const SAVE_FAILED: LocalizedText = { en: "Could not save — try again.", fil: "Hindi na-save — subukan ulit." };
const VIEW_ONLY: LocalizedText = { en: "View only", fil: "Tingnan lang" };
const ADD_MARKER: LocalizedText = { en: "Add marker", fil: "Magdagdag ng marker" };
const CANCEL: LocalizedText = { en: "Cancel", fil: "Kanselahin" };
const MARKER_TYPE_LABEL: LocalizedText = { en: "Marker type", fil: "Uri ng marker" };
const CAPTION_PLACEHOLDER: LocalizedText = { en: "Add a note (optional)", fil: "Magdagdag ng tala (opsyonal)" };
const PLACE_MARKER: LocalizedText = { en: "Tap map to place", fil: "I-tap ang mapa" };
const SAVE: LocalizedText = { en: "Save", fil: "I-save" };
const DELETE: LocalizedText = { en: "Delete", fil: "Burahin" };

interface LayerVisibility {
  hazard: boolean;
  pins: boolean;
  pois: boolean;
  cascade: boolean;
  official: boolean;
}

/** Placed on the map when the admin taps during official-marker placement mode. */
function OfficialPinPlacer({ onPlace }: { onPlace: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPlace(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
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
  const userId = useSessionUserId();
  const alerts = useAlerts();
  const officialMarkers = useOfficialMarkers();
  const baseAlertFor = (zoneId: string) => alerts.find((a) => a.zoneId === zoneId && a.isActive);
  const [hazardType, setHazardType] = useState<HazardType>("flood");
  const [layers, setLayers] = useState<LayerVisibility>({
    hazard: true,
    pins: true,
    pois: true,
    cascade: true,
    official: true,
  });

  const [isPlacingOfficial, setIsPlacingOfficial] = useState(false);
  const [pendingOfficialType, setPendingOfficialType] = useState<OfficialMarkerType>("flood");
  const [pendingOfficialCaption, setPendingOfficialCaption] = useState("");
  const [pendingOfficialPos, setPendingOfficialPos] = useState<{ lat: number; lng: number } | null>(null);

  const center: [number, number] = [zones[0].lat, zones[0].lng];
  const [zoom, setZoom] = useState(14);
  const [viewCenter, setViewCenter] = useState<[number, number]>(center);

  /**
   * Viewport-culled zones for anything rendered one-marker/circle-per-zone
   * (status markers, evac markers, the hazard backdrop, POIs). `zones` here
   * is the FULL reference-data set — same array the resident map receives —
   * so without this an official's map would try to place a Leaflet marker
   * for every one of V1's ~42k barangays on every render. `zoneById` below
   * stays on the full list: a community pin or cascade line has to resolve
   * its own zone regardless of what's currently in view.
   */
  const radiusDeg = viewportRadiusDeg(zoom);
  const markerCap = viewportMarkerCap(zoom);
  const visibleZones = useMemo(() => {
    const filtered = zones.filter(
      (z) => Math.abs(z.lat - viewCenter[0]) < radiusDeg && Math.abs(z.lng - viewCenter[1]) < radiusDeg
    );
    return filtered.slice(0, markerCap);
  }, [zones, viewCenter, radiusDeg, markerCap]);

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
      className={isPlacingOfficial ? "cursor-crosshair" : ""}
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
                  ["official", LAYER_OFFICIAL],
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

          {/* Add Official Marker button */}
          <div className="pointer-events-auto absolute bottom-2 right-2">
            {isPlacingOfficial ? (
              <div className="space-y-2 rounded-lg border-2 border-border bg-background/95 p-2 shadow-md backdrop-blur">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground">{t(MARKER_TYPE_LABEL, lang)}</label>
                  <select
                    value={pendingOfficialType}
                    onChange={(e) => setPendingOfficialType(e.target.value as OfficialMarkerType)}
                    className="w-full rounded-md border-2 border-border bg-background px-2 py-1 text-xs"
                  >
                    {OFFICIAL_MARKER_TYPES.map((type) => (
                      <option key={type} value={type}>{t(OFFICIAL_MARKER_LABEL[type], lang)}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={pendingOfficialCaption}
                  onChange={(e) => setPendingOfficialCaption(e.target.value)}
                  placeholder={t(CAPTION_PLACEHOLDER, lang)}
                  className="w-full rounded-md border-2 border-border bg-background px-2 py-1 text-xs"
                />
                {pendingOfficialPos && (
                  <p className="text-[10px] text-muted-foreground">
                    {pendingOfficialPos.lat.toFixed(5)}, {pendingOfficialPos.lng.toFixed(5)}
                  </p>
                )}
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (pendingOfficialPos) {
                        officialMarkers.addMarker(
                          pendingOfficialPos.lat,
                          pendingOfficialPos.lng,
                          pendingOfficialType,
                          pendingOfficialCaption,
                          userId ?? "admin",
                        );
                        setIsPlacingOfficial(false);
                        setPendingOfficialCaption("");
                        setPendingOfficialPos(null);
                      }
                    }}
                    disabled={!pendingOfficialPos}
                    className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {t(SAVE, lang)}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlacingOfficial(false);
                      setPendingOfficialCaption("");
                      setPendingOfficialPos(null);
                    }}
                    className="flex-1 rounded-md border-2 border-border px-2 py-1 text-xs font-medium"
                  >
                    {t(CANCEL, lang)}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsPlacingOfficial(true)}
                className="flex items-center gap-1.5 rounded-lg border-2 border-border bg-background/95 px-2.5 py-1.5 text-xs font-medium shadow-md backdrop-blur transition-colors hover:bg-muted/50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
                {t(ADD_MARKER, lang)}
              </button>
            )}
          </div>

          {isPlacingOfficial && (
            <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-md border-2 border-border bg-background/95 px-3 py-1 text-xs font-medium shadow-md">
              {t(PLACE_MARKER, lang)}
            </div>
          )}
        </>
      }
    >
      <ViewportTracker onZoom={setZoom} onCenter={setViewCenter} />

      {layers.hazard && <HazardBackdropLayer zones={visibleZones} hazardType={hazardType} />}
      {layers.pois && <PoiMarkerLayer zones={visibleZones} />}

      {isPlacingOfficial && (
        <OfficialPinPlacer
          onPlace={(lat, lng) => setPendingOfficialPos({ lat, lng })}
        />
      )}

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

      {visibleZones.map((zone) => {
        const alert = baseAlertFor(zone.id);
        const status = getZoneStatus(alert);
        const label = `${zone.name} — ${t(ZONE_STATUS_LABEL[status], lang)}`;
        // The FULL zones list, not visibleZones: a zone's risk score depends
        // on its cascade neighbours, who may sit just outside the viewport.
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

      {visibleZones.map((zone) => (
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

      {/* Official markers */}
      {layers.official &&
        officialMarkers.markers.map((marker) => {
          const label = `${t(OFFICIAL_MARKER_LABEL[marker.type], lang)}${marker.caption ? ` — ${marker.caption}` : ""}`;
          return (
            <Marker
              key={marker.id}
              position={[marker.lat, marker.lng]}
              icon={createOfficialMarkerIcon(marker.type, label)}
            >
              <Popup>
                <div className="space-y-1.5 text-sm">
                  <p className="font-medium">{t(OFFICIAL_MARKER_LABEL[marker.type], lang)}</p>
                  {marker.caption && <p className="text-xs text-muted-foreground">{marker.caption}</p>}
                  <p className="text-[10px] text-muted-foreground">
                    Placed {new Date(marker.placedAt).toLocaleTimeString()}
                  </p>
                  <button
                    type="button"
                    onClick={() => officialMarkers.removeMarker(marker.id)}
                    className="rounded border-2 border-severity-red px-2 py-0.5 text-xs font-medium text-severity-red"
                  >
                    {t(DELETE, lang)}
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}

      {/* Reads useAllCommunityPins, not useCommunityPins: a removed pin has to
          stay visible here or there'd be no way to restore one that voting took
          down wrongly (PRD Core Feature #5's "remove or restore any pin"). A
          pin whose zone cannot be resolved is skipped — same as the
          moderation panel (see community-pin-moderation-panel.tsx) — since
          it cannot be proven in or out of the official's area. */}
      {layers.pins &&
        allPins.map((pin) => {
          const zone = zoneById.get(pin.zoneId);
          if (!zone) return null;
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
                  <CommunityPinActions pin={pin} canManage={managesZone(zone)} lang={lang} />
                </div>
              </Popup>
            </Marker>
          );
        })}
    </MapShell>
  );
}

/**
 * The Remove/Restore control for one community-pin marker's popup. Its own
 * component (not inline in AdminMapCanvas's pins.map()) for the same reason
 * ZoneAlertSelect and CenterOccupancyControl are: a per-marker useState call
 * must not live inside a loop.
 *
 * Gated by canManage exactly like its neighbours in this file. When it IS
 * shown, the write is watched for a permanent failure — an out-of-area
 * write is refused by RLS, and `mergePins` then quietly drops the queued
 * entry, reverting the marker to its prior state with no explanation unless
 * something is watching for that.
 */
function CommunityPinActions({
  pin,
  canManage,
  lang,
}: {
  pin: CommunityPin;
  canManage: boolean;
  lang: LanguageCode;
}) {
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);
  const outbox = useOutbox();
  const failed =
    pendingEntryId !== null &&
    outbox.some((entry) => entry.id === pendingEntryId && entry.status === "stuck");

  function handleClick() {
    const entry = pin.removed ? restoreCommunityPin(pin.id) : removePinByAdmin(pin.id);
    setPendingEntryId(entry.id);
  }

  if (!canManage) {
    return <p className="text-xs text-muted-foreground">{t(VIEW_ONLY, lang)}</p>;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`rounded border-2 px-2 py-0.5 text-xs font-medium ${
          pin.removed ? "border-border" : "border-severity-red text-severity-red"
        }`}
      >
        {t(pin.removed ? RESTORE_PIN : REMOVE_PIN, lang)}
      </button>
      {failed && <p className="text-xs text-severity-red">{t(SAVE_FAILED, lang)}</p>}
    </>
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
  // Through the alerts store, which refreshes the alert list once the write
  // is confirmed, so this select and the marker follow it (C1).
  const setZoneAlert = useSetZoneAlert();

  async function handleChange(value: Severity | "none") {
    setError(false);
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
 * carried through reference data) and then tracked in this component's own
 * state as the admin edits it — a write doesn't itself refetch reference
 * data, so this state only reflects the server again after the next
 * fetch/reload. Typing here derives the status shown below immediately;
 * the database write via setCenterOccupancy happens once the value is
 * committed (see useHeadcountCommit).
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
  const [error, setError] = useState(false);

  // Dynamic import for the same reason ZoneAlertSelect's does: set-center.ts
  // is a "use server" module and must not be pulled statically into a
  // client-component test's module graph.
  async function writeOccupancy(value: number | undefined) {
    setError(false);
    const { setCenterOccupancy } = await import("@/app/actions/set-center");
    const result = await setCenterOccupancy({ zoneId: zone.id, occupancy: value ?? null });
    if (!result.ok) setError(true);
  }

  // Written once per committed value, not per keystroke (M9).
  const headcount = useHeadcountCommit(zone.currentOccupancy, writeOccupancy);
  const occupancy = headcount.occupancy;
  const centerStatus = resolveEffectiveCenterStatus(zone.centerStatus, zone.evacuationCenterCapacity, occupancy);

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
          onChange={(event) => headcount.change(event.target.value === "" ? undefined : Number(event.target.value))}
          onBlur={() => headcount.commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") headcount.commit();
          }}
          aria-label={`${t(HEADCOUNT, lang)} — ${zone.evacuationCenterName}`}
          className="w-full rounded-md border-2 border-border bg-background px-2 py-1 text-sm"
        />
      </label>
      {error && <p className="text-xs text-severity-red">{t(SAVE_FAILED, lang)}</p>}
    </>
  );
}
