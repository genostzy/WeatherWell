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

  return {
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
  } as const;
}
