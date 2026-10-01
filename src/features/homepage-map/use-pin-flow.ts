"use client";

import { useState } from "react";
import { getBearingAndDistance } from "./bearing-distance";
import {
  addCommunityPin,
  updateCommunityPin,
  deleteOwnPin,
  type CommunityPin,
} from "@/lib/community-pins";
import type { Zone } from "@/lib/types";
import type { CommunityPinFormValues } from "./community-pin-form";

/** The database refuses a pin farther than this from the barangay it names (20260930070414). */
const PIN_RADIUS_M = 15_000;

function nearestZone(zones: Zone[], at: { lat: number; lng: number }): { zone: Zone; distanceM: number } {
  let best = { zone: zones[0], distanceM: getBearingAndDistance(at, zones[0]).distanceMeters };
  for (const zone of zones) {
    const distanceM = getBearingAndDistance(at, zone).distanceMeters;
    if (distanceM < best.distanceM) best = { zone, distanceM };
  }
  return best;
}

/**
 * Manages the community pin placement, editing, viewing, and deletion flow.
 * Extracted from HomepageMap to reduce its useState count and isolate the
 * pin-related concerns.
 */
export function usePinFlow(zones: Zone[]) {
  const [isPlacingPin, setIsPlacingPin] = useState(false);
  const [pendingPinLocation, setPendingPinLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [editingPin, setEditingPin] = useState<CommunityPin | null>(null);
  const [photoPin, setPhotoPin] = useState<CommunityPin | null>(null);
  const [deletingPin, setDeletingPin] = useState<CommunityPin | null>(null);
  // A tap farther than 15 km from every barangay: the map says why and waits for a closer one,
  // rather than queueing a pin the database would refuse.
  const [pinTooFar, setPinTooFar] = useState(false);

  function handleMapClickForPin(lat: number, lng: number) {
    if (zones.length > 0 && nearestZone(zones, { lat, lng }).distanceM > PIN_RADIUS_M) {
      setPinTooFar(true);
      return;
    }
    setPinTooFar(false);
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
    addCommunityPin({
      zoneId: nearestZone(zones, pendingPinLocation).zone.id,
      statusTag: input.statusTag,
      caption: input.caption,
      lat: pendingPinLocation.lat,
      lng: pendingPinLocation.lng,
      ...(input.photoPath ? { photoPath: input.photoPath } : {}),
    });
    setPendingPinLocation(null);
  }

  return {
    isPlacingPin,
    setIsPlacingPin: (next: boolean | ((current: boolean) => boolean)) => {
      setPinTooFar(false);
      setIsPlacingPin(next);
    },
    pinTooFar,
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
  } as const;
}
