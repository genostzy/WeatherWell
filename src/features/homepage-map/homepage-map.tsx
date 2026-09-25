"use client";

import { useState } from "react";
import { NAV_ACTIVE } from "@/components/nav-active";
import { PushPrompt } from "@/features/onboarding/push-prompt";
import { OfficialBanner } from "@/features/auth/official-banner";
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
import { FloodModeActions } from "./flood-mode-actions";
import { CurrentConditionsPanel } from "./current-conditions-panel";
import { QuickStats } from "./quick-stats";
import { QuickDepthReport } from "@/features/water-level-report/quick-depth-report";
import { useFloodForecast } from "@/lib/use-flood-forecast";
import { PredictionTimeline } from "@/features/alerts/prediction-timeline";
import { CommunityPinForm } from "./community-pin-form";
import { PhotoLightbox } from "./photo-lightbox";
import { OverlayDialog } from "@/components/overlay-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { hasRealEvacuationCenter, NO_VERIFIED_CENTER } from "@/lib/zone-data-quality";
import { CoverageNote } from "@/features/zones/coverage-note";
import type { HazardType, LocalizedText, Zone } from "@/lib/types";

const ALERTS_ON_PHONE: LocalizedText = { en: "Alerts on this phone", fil: "Alerto sa teleponong ito" };
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
  // Which quick action's route the map is showing, so its button can say so.
  // Picking a barangay on the map replaces that route, and clears it.
  const [activeAction, setActiveAction] = useState<"safe-area" | "evac-centre" | null>(null);
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
    {/*
      One column on a phone, sized to the screen (minmax(0,1fr)): an unsized
      column grew to the map's width and pushed everything 7px right.
      Phone order is status, safety actions, map, then the rest; on desktop
      the map takes the left column and the two stacks share the right.
    */}
    <div
      data-home-grid
      className="grid w-full grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:col-start-2 lg:row-start-1">
        <OfficialBanner />
        <PersonalStatusHeadline zone={zones[0]} />
        <FloodModeActions zone={zones[0]} />

        {/* The two safety actions come straight after the status. */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={activeAction === "safe-area"}
            onClick={() => {
              handleFindSafeArea();
              setActiveAction("safe-area");
            }}
            className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-3 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
              activeAction === "safe-area" ? `border-primary ${NAV_ACTIVE}` : "border-border hover:bg-muted/50"
            }`}
          >
            <ShieldCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
            <span className="text-sm leading-tight font-medium">{t(FIND_SAFE_AREA, lang)}</span>
          </button>
          <button
            type="button"
            aria-pressed={activeAction === "evac-centre"}
            onClick={() => {
              handleFindSafeEvacuationCenter();
              setRevealEvacuationCenters(true);
              setActiveAction("evac-centre");
            }}
            className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-3 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
              activeAction === "evac-centre" ? `border-primary ${NAV_ACTIVE}` : "border-border hover:bg-muted/50"
            }`}
          >
            <Building2 aria-hidden="true" className="h-5 w-5 shrink-0" />
            <span className="text-sm leading-tight font-medium">{t(FIND_SAFE_EVACUATION_CENTER, lang)}</span>
          </button>
        </div>

        {/* Route info — only when a route is active, right under the action that made it */}
        {routeZone && (directionToSafety || routeHazard || notice) && (
          <div className="rounded-xl border-2 border-border p-3 text-sm">
            {routeZone && directionToSafety && hasRealEvacuationCenter(routeZone) && (
              <p className="font-medium break-words">
                {Math.round(directionToSafety.distanceMeters)}m{" "}
                {t(COMPASS_LABEL[directionToSafety.compassLabel], lang)} {t(TO, lang)}{" "}
                {routeZone.evacuationCenterName}
              </p>
            )}
            {routeZone && directionToSafety && !hasRealEvacuationCenter(routeZone) && (
              <p lang={lang} className="font-medium break-words">
                {t(NO_VERIFIED_CENTER, lang)}
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

        <QuickDepthReport zoneId={zones[0].id} />
      </div>

      {/* Map — desktop: the whole left column. */}
      <div data-home-map className="min-w-0 space-y-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        {isPlacingPin && (
          <div className="rounded-md border-2 border-border bg-muted/50 px-3 py-1.5 text-center text-xs font-medium">
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
          onSelectZone={(zoneId) => {
            handleSelectZone(zoneId);
            setActiveAction(null);
          }}
          isPlacingPin={isPlacingPin}
          onMapClickForPin={handleMapClickForPin}
          onEditPin={setEditingPin}
          onDeletePin={setDeletingPin}
          onViewPhoto={setPhotoPin}
          livePosition={livePosition}
          revealEvacuationCenters={revealEvacuationCenters}
        />
        {/* Adding a pin is a map action, so it sits with the map. */}
        <button
          type="button"
          aria-pressed={isPlacingPin}
          onClick={() => setIsPlacingPin((v) => !v)}
          className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
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

      {/* The rest: useful, not urgent. */}
      <div className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:col-start-2 lg:row-start-2">
        {/* Alerts could only be turned on during first setup; this is where they live now. */}
        <section aria-labelledby="alerts-on-phone" className="space-y-2 rounded-xl border-2 border-border p-3">
          <h2 id="alerts-on-phone" lang={lang} className="text-sm font-medium">
            {t(ALERTS_ON_PHONE, lang)}
          </h2>
          <PushPrompt zoneId={zones[0].id} />
        </section>

        <CurrentConditionsPanel zone={zones[0]} />
        {forecast && forecast.steps.length > 0 && (
          <PredictionTimeline steps={forecast.steps} zoneName={zones[0].name} />
        )}
        <CoverageNote zone={zones[0]} />
        <QuickStats />
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
