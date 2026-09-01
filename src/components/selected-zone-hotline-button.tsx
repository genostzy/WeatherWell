"use client";

import { EmergencyHotlineButton } from "@/components/emergency-hotline-button";
import { useSelectedZone } from "@/features/zones/use-selected-zone";

/**
 * The persistent hotline button lives in the root layout, which is a Server
 * Component and cannot read localStorage. This client wrapper resolves the
 * user's chosen zone so the number they dial is their own barangay's, not
 * zone-1's, and keeps EmergencyHotlineButton itself a pure presentational
 * component that takes the number as a prop.
 */
export function SelectedZoneHotlineButton() {
  const zone = useSelectedZone();
  return <EmergencyHotlineButton hotlineNumber={zone.hotlineNumber} />;
}
