"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getZoneStatus } from "@/lib/zone-status";
import { useZoneOverrides, resolveEffectiveAlert } from "@/lib/zone-overrides";
import { PersonalStatusHeadline } from "./personal-status-headline";
import { CurrentConditionsPanel } from "./current-conditions-panel";
import { CommunityPinForm, type CommunityPinFormValues } from "./community-pin-form";
import { PhotoLightbox } from "./photo-lightbox";
import { OverlayDialog } from "@/components/overlay-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getBearingAndDistance } from "./bearing-distance";
import { useLivePosition } from "./use-live-position";
import { routeCrossesHazard } from "./route-hazard";
import {
  addCommunityPin,
  updateCommunityPin,
  deleteOwnPin,
  type CommunityPin,
} from "@/lib/community-pins";
import type { HazardType, LocalizedText, Zone } from "@/lib/types";

const MapCanvas = dynamic(() => import("./map-canvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <Skeleton className="h-[340px] w-full rounded-md sm:h-[400px] lg:h-[600px]" />,
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
const NO_SAFE_AREA_FOUND: LocalizedText = {
  en: "No zone is currently Safe.",
  fil: "Walang zone na Ligtas sa ngayon.",
};
const NO_SAFE_ROUTE_FOUND: LocalizedText = {
  en: "Every route currently passes through a hazardous area.",
  fil: "Lahat ng ruta ay dumadaan sa mapanganib na lugar sa ngayon.",
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
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const [pendingPinLocation, setPendingPinLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [editingPin, setEditingPin] = useState<CommunityPin | null>(null);
  const [photoPin, setPhotoPin] = useState<CommunityPin | null>(null);
  const [deletingPin, setDeletingPin] = useState<CommunityPin | null>(null);
  const livePosition = useLivePosition();
  const overrides = useZoneOverrides();

  const routeZone = zones.find((z) => z.id === routeZoneId) ?? null;
  const directionToSafety =
    routeZone && livePosition
      ? getBearingAndDistance(livePosition, {
          lat: routeZone.evacuationCenterLat,
          lng: routeZone.evacuationCenterLng,
        })
      : null;
  const routeHazard = routeZone ? routeCrossesHazard(routeZone, zones) : false;

  function handleSelectZone(zoneId: string) {
    setRouteZoneId(zoneId);
    setNotice(null);
  }

  function handleFindSafeArea() {
    const safeZone = zones.find(
      (z) => getZoneStatus(resolveEffectiveAlert(z.id, overrides[z.id]?.alertSeverity)) === "safe"
    );
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

  function handleMapClickForPin(lat: number, lng: number) {
    setPendingPinLocation({ lat, lng });
    setIsPlacingPin(false);
  }

  function handlePinFormCancel() {
    setPendingPinLocation(null);
    setEditingPin(null);
  }

  function handleEditPinSubmit(values: CommunityPinFormValues) {
    if (!editingPin) return;
    updateCommunityPin(editingPin.id, values);
    setEditingPin(null);
  }

  function handleConfirmDeletePin() {
    if (!deletingPin) return;
    deleteOwnPin(deletingPin.id);
    if (editingPin?.id === deletingPin.id) setEditingPin(null);
    if (photoPin?.id === deletingPin.id) setPhotoPin(null);
    setDeletingPin(null);
  }

  function handlePinFormSubmit(input: CommunityPinFormValues) {
    if (!pendingPinLocation) return;
    // Nearest zone by straight-line distance — the same math already used
    // for the direction-to-safety indicator, just picking the closest zone
    // center instead of a fixed evacuation center.
    const nearestZone = zones.reduce((closest, zone) => {
      const distance = getBearingAndDistance(pendingPinLocation, zone).distanceMeters;
      const closestDistance = getBearingAndDistance(pendingPinLocation, closest).distanceMeters;
      return distance < closestDistance ? zone : closest;
    }, zones[0]);

    addCommunityPin({
      zoneId: nearestZone.id,
      statusTag: input.statusTag,
      caption: input.caption,
      photoDataUrl: input.photoDataUrl,
      lat: pendingPinLocation.lat,
      lng: pendingPinLocation.lng,
    });
    setPendingPinLocation(null);
  }

  return (
    <div className="grid w-full max-w-2xl gap-3 sm:gap-4 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <div className="lg:col-start-2 lg:row-start-1">
        <PersonalStatusHeadline zone={zones[0]} />
      </div>

      <div className="lg:col-start-2 lg:row-start-2">
        <CurrentConditionsPanel zone={zones[0]} />
      </div>

      <div className="lg:col-start-1 lg:row-span-4">
        <MapCanvas
          zones={zones}
          hazardType={hazardType}
          onHazardTypeChange={setHazardType}
          routeZone={routeZone}
          routeHazard={routeHazard}
          onSelectZone={handleSelectZone}
          isPlacingPin={isPlacingPin}
          onMapClickForPin={handleMapClickForPin}
          onEditPin={setEditingPin}
          onDeletePin={setDeletingPin}
          onViewPhoto={setPhotoPin}
        />
      </div>

      <div className="flex flex-wrap gap-2 lg:col-start-2 lg:row-start-3">
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

      {(routeZone || notice) && (
        <p lang={lang} className="text-sm lg:col-start-2 lg:row-start-4">
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

      {/* Both of these open over the map rather than below it — a form or photo
          rendered inline would land off-screen behind a full-height map. */}
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
              photoDataUrl: editingPin.photoDataUrl,
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
  );
}
