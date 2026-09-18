"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
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
import { ActionGrid } from "./action-grid";
import { QuickStats } from "./quick-stats";
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
    <div className="grid w-full gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
      {/* Mobile: status + actions + map + conditions. Desktop: map left, sidebar right. */}

      {/* Map — desktop: left column. Mobile: below actions. */}
      <div className="order-last lg:order-first lg:col-start-1 lg:row-span-4">
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
        />
      </div>

      {/* Sidebar — desktop: right column. Mobile: above map. */}
      <div className="order-first lg:order-none flex flex-col gap-3 sm:gap-4 lg:col-start-2 lg:row-span-4 lg:gap-5">
        <PersonalStatusHeadline zone={zones[0]} />
        <QuickStats />
        <ActionGrid />
        <CurrentConditionsPanel zone={zones[0]} />

        {forecast && forecast.steps.length > 0 && (
          <PredictionTimeline steps={forecast.steps} zoneName={zones[0].name} />
        )}

        {/* Route info — only render when there's actual content to show */}
        {routeZone && (directionToSafety || routeHazard || notice) && (
          <div className="rounded-xl border-2 border-border p-3 text-sm">
            {routeZone && directionToSafety && (
              <p className="font-medium">
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

        {/* Route action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleFindSafeArea}>
            {t(FIND_SAFE_AREA, lang)}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleFindSafeEvacuationCenter}>
            {t(FIND_SAFE_EVACUATION_CENTER, lang)}
          </Button>
          <Button
            type="button"
            variant={isPlacingPin ? "default" : "outline"}
            size="sm"
            onClick={() => setIsPlacingPin((v) => !v)}
          >
            {t(isPlacingPin ? CANCEL_ADD_PIN : ADD_FLOOD_PIN, lang)}
          </Button>
        </div>
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
