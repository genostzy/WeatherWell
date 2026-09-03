"use client";

import { getDeviceId } from "./device-id";
import { createLocalStorageStore } from "./local-storage-store";

/**
 * PRD Gap D (post-evacuation accountability, from the Climate Resilience
 * plan): the app tells residents to evacuate but has no signal on whether
 * they did or whether they need help. Phase 1 scope only — this is an
 * unverified self-report, same trust model as community pins, with no
 * location check and no real notification to responders.
 */
export type CheckInStatus = "safe" | "needs_help";

export interface EvacuationCheckIn {
  id: string;
  zoneId: string;
  deviceId: string;
  status: CheckInStatus;
  checkedInAt: string;
}

const store = createLocalStorageStore<EvacuationCheckIn[]>(
  "weatherwell.evacuationCheckIns",
  "weatherwell:evacuation-checkins-changed",
  []
);

/** Every check-in, live. Call once per component and filter the returned array — never call this hook inside a loop. */
export function useEvacuationCheckIns(): EvacuationCheckIn[] {
  return store.useStore();
}

export function getCheckInsForZone(checkIns: EvacuationCheckIn[], zoneId: string): EvacuationCheckIn[] {
  return checkIns.filter((checkIn) => checkIn.zoneId === zoneId);
}

/** This device's own check-in for a zone, if any — lets the resident UI show a confirmation instead of the buttons again. */
export function getOwnCheckInForZone(
  checkIns: EvacuationCheckIn[],
  zoneId: string
): EvacuationCheckIn | undefined {
  const deviceId = getDeviceId();
  return checkIns.find((checkIn) => checkIn.zoneId === zoneId && checkIn.deviceId === deviceId);
}

/** Records (or replaces) this device's check-in for a zone — a resident can change "I'm safe" to "I need help" later, so this isn't append-only. */
export function recordCheckIn(zoneId: string, status: CheckInStatus): void {
  const deviceId = getDeviceId();
  store.update((checkIns) => [
    ...checkIns.filter((checkIn) => !(checkIn.zoneId === zoneId && checkIn.deviceId === deviceId)),
    {
      id: `checkin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      zoneId,
      deviceId,
      status,
      checkedInAt: new Date().toISOString(),
    },
  ]);
}
