"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ShieldCheck, Building2, Droplet, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getBearingAndDistance } from "./bearing-distance";
import { useLivePosition } from "./use-live-position";
import { useRouteFinding } from "./use-route-finding";
import { usePinFlow } from "./use-pin-flow";
import { useGeofenceAlert } from "./use-geofence-alert";
import { GeofenceAlertBanner } from "./geofence-alert-banner";
import { PersonalStatusHeadline } from "./personal-status-headline";
import { CurrentConditionsPanel } from "./current-conditions-panel";
import { QuickStats } from "./quick-stats";
import { QuickDepthReport } from "@/features/water-level-report/quick-depth-report";
import { useFloodForecast } from "@/lib/use-flood-forecast";
import { PredictionTimeline } from "@/features/alerts/prediction-timeline";
import { CommunityPinForm } from "./community-pin-form";
import { PhotoLightbox } from "./photo-lightbox";
import { OverlayDialog } from "@/components/overlay-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { HazardType, LocalizedText, Zone } from "@/lib/types";

const MapCanvas = dynamic(() => import("./map-canvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <Skeleton className="h-[280px] w-full rounded-xl sm:h-[400px] lg:h-[600px]" />,
});

const TO: LocalizedText = { en: "to", fil: "papunta sa" };
const PASSES_THROUGH_HAZARD: LocalizedText = {
  en: "Passes through a hazardous area",
  fil: "Dumadaan sa mapanganib na lugar",
};
const FIND_SAFE_AREA: LocalizedText = { en: "Find safe area", fil: "Hanapin ang ligtas na lugar" };
const FIND_SAFE_EVACUATION_CENTER: LocalizedText = {
  en: "Find safe evacuation center",
  fil: "Hanapin ang ligtas na evacuation center",
};
const ADD_FLOOD_PIN: LocalizedText = { en: "Add flood pin", fil: "Magdagdag ng flood pin" };
const CANCEL_ADD_PIN: LocalizedText = { en: "Cancel adding pin", fil: "Kanselahin ang pagdagdag ng pin" };
const TAP_MAP_TO_PLACE: LocalizedText = {
  en: "Tap the map to drop your pin",
  fil: "Pindutin ang mapa para ilagay ang pin",
};
const PIN_DIALOG_LABEL: LocalizedText = { en: "Flood pin details", fil: "Detalye ng flood pin" };
const CLOSE_DIALOG: LocalizedText = { en: "Close", fil: "Isara" };
const DELETE_PIN_TITLE: LocalizedText = { en: "Delete this pin?", fil: "Burahin ang pin na ito?" };
const DELETE_PIN_BODY: LocalizedText = {
  en: "This can't be undone — unlike an admin removal, your own pin isn't kept for restoring.",
  fil: "Hindi na maibabalik ito — kapag inalis ng admin, maibabalik pa; ang sarili mong pin, hindi na.",
};
const DELETE: LocalizedText = { en: "Delete", fil: "Burahin" };
const CANCEL: LocalizedText = { en: "Cancel", fil: "Kanselahin" };

/** Compass codes returned by `getBearingAndDistance` */
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
  // Set only by "Find safe evacuation center" — see MapCanvas's own comment
  // on evacVisible for why a route to a safe zone (Find safe area) does not
  // also reveal the shelter layer.
  const [revealEvacuationCenters, setRevealEvacuationCenters] = useState(false);
  const livePosition = useLivePosition();
  const { alert: geofenceAlert, dismiss: dismissGeofence } = useGeofenceAlert(zones, livePosition);
  const forecast = useFloodForecast(zones[0]?.id);

  const {
    routeZone,
    routeHazard,
    notice,
    effectiveRoutePolyline,
    handleSelectZone,
    handleFindSafeArea,
    handleFindSafeEvacuationCenter,
  } = useRouteFinding(zones);

  const {
    isPlacingPin,
    setIsPlacingPin,
    pendingPinLocation,
    editingPin,
    setEditingPin,
    photoPin,
    setPhotoPin,
    deletingPin,
    setDeletingPin,
    handleMapClickForPin,
    handlePinFormCancel,
    handleEditPinSubmit,
    handleConfirmDeletePin,
    handlePinFormSubmit,
  } = usePinFlow(zones);

  const directionToSafety =
    routeZone && livePosition
      ? getBearingAndDistance(livePosition, {
          lat: routeZone.evacuationCenterLat,
          lng: routeZone.evacuationCenterLng,
        })
      : null;

  return (
    <>
    {geofenceAlert && (
      <GeofenceAlertBanner
        severity={geofenceAlert.severity}
        message={geofenceAlert.message}
        onDismiss={dismissGeofence}
      />
    )}
    <div className="grid w-full gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
      {/* Mobile: status + actions + map + conditions. Desktop: map left, sidebar right. */}

      {/* Map — desktop: left column. Mobile: below actions. */}
      <div className="order-last lg:order-first lg:col-start-1 lg:row-span-4">
        {isPlacingPin && (
          <div className="mb-2 rounded-md border-2 border-border bg-muted/50 px-3 py-1.5 text-center text-xs font-medium">
            {t(TAP_MAP_TO_PLACE, lang)}
          </div>
        )}
        <MapCanvas
          zones={zones}
          hazardType={hazardType}
          onHazardTypeChange={setHazardType}
          routeZone={routeZone}
          routeHazard={routeHazard}
          effectiveRoutePolyline={effectiveRoutePolyline}
          onSelectZone={handleSelectZone}
          isPlacingPin={isPlacingPin}
          onMapClickForPin={handleMapClickForPin}
          onEditPin={setEditingPin}
          onDeletePin={setDeletingPin}
          onViewPhoto={setPhotoPin}
          livePosition={livePosition}
          revealEvacuationCenters={revealEvacuationCenters}
        />
      </div>

      {/* Sidebar — desktop: right column. Mobile: above map. */}
      <div className="order-first lg:order-none flex flex-col gap-2 overflow-hidden sm:gap-3 lg:col-start-2 lg:row-span-4 lg:gap-4">
        <PersonalStatusHeadline zone={zones[0]} />

        <QuickDepthReport zoneId={zones[0].id} />

        {/* Quick actions — primary, placed right after status so they're seen first */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleFindSafeArea}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-border px-3 py-3 text-center outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ShieldCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
            <span className="text-xs leading-tight font-medium">{t(FIND_SAFE_AREA, lang)}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              handleFindSafeEvacuationCenter();
              setRevealEvacuationCenters(true);
            }}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-border px-3 py-3 text-center outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Building2 aria-hidden="true" className="h-5 w-5 shrink-0" />
            <span className="text-xs leading-tight font-medium">
              {t(FIND_SAFE_EVACUATION_CENTER, lang)}
            </span>
          </button>
          <button
            type="button"
            aria-pressed={isPlacingPin}
            onClick={() => setIsPlacingPin((v) => !v)}
            className={`col-span-2 flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
              isPlacingPin
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/80"
                : "border-border hover:bg-muted/50"
            }`}
          >
            {isPlacingPin ? (
              <X aria-hidden="true" className="h-4 w-4 shrink-0" />
            ) : (
              <Droplet aria-hidden="true" className="h-4 w-4 shrink-0" />
            )}
            {t(isPlacingPin ? CANCEL_ADD_PIN : ADD_FLOOD_PIN, lang)}
          </button>
        </div>

        <QuickStats />

        {/* Weather + forecast — collapsible, lower priority */}
        <CurrentConditionsPanel zone={zones[0]} />
        {forecast && forecast.steps.length > 0 && (
          <PredictionTimeline steps={forecast.steps} zoneName={zones[0].name} />
        )}

        {/* Route info — only when a route is active */}
        {routeZone && (directionToSafety || routeHazard || notice) && (
          <div className="rounded-xl border-2 border-border p-3 text-sm">
            {routeZone && directionToSafety && (
              <p className="font-medium break-words">
                {Math.round(directionToSafety.distanceMeters)}m{" "}
                {t(COMPASS_LABEL[directionToSafety.compassLabel], lang)} {t(TO, lang)}{" "}
                {routeZone.evacuationCenterName}
              </p>
            )}
            {routeZone && routeHazard && (
              <p className="mt-1 rounded bg-severity-evacuate/20 px-2 py-0.5 font-medium text-severity-evacuate">
                {t(PASSES_THROUGH_HAZARD, lang)}
              </p>
            )}
            {notice && <p className="mt-1 text-muted-foreground">{t(notice, lang)}</p>}
          </div>
        )}

      </div>

      {/* Dialogs — both open over the map */}
      {pendingPinLocation && (
        <OverlayDialog
          onClose={handlePinFormCancel}
          label={t(PIN_DIALOG_LABEL, lang)}
          closeLabel={t(CLOSE_DIALOG, lang)}
        >
          <CommunityPinForm onSubmit={handlePinFormSubmit} onCancel={handlePinFormCancel} />
        </OverlayDialog>
      )}

      {editingPin && (
        <OverlayDialog
          onClose={handlePinFormCancel}
          label={t(PIN_DIALOG_LABEL, lang)}
          closeLabel={t(CLOSE_DIALOG, lang)}
        >
          <CommunityPinForm
            mode="edit"
            initialValues={{
              statusTag: editingPin.statusTag,
              caption: editingPin.caption,
            }}
            onSubmit={handleEditPinSubmit}
            onCancel={handlePinFormCancel}
          />
        </OverlayDialog>
      )}

      {photoPin?.photoDataUrl && (
        <PhotoLightbox
          photoDataUrl={photoPin.photoDataUrl}
          statusTag={photoPin.statusTag}
          caption={photoPin.caption}
          onClose={() => setPhotoPin(null)}
        />
      )}

      {deletingPin && (
        <ConfirmDialog
          title={t(DELETE_PIN_TITLE, lang)}
          body={t(DELETE_PIN_BODY, lang)}
          confirmLabel={t(DELETE, lang)}
          cancelLabel={t(CANCEL, lang)}
          closeLabel={t(CLOSE_DIALOG, lang)}
          onConfirm={handleConfirmDeletePin}
          onCancel={() => setDeletingPin(null)}
        />
      )}
    </div>
    </>
  );
}
