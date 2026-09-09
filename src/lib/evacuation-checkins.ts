"use client";

import { getDeviceId } from "./device-id";
import { createLocalStorageStore } from "./local-storage-store";
import type { CheckInStatus } from "./types";
import type { OutboxEntry } from "./outbox/types";

/**
 * Now defined in ./types.ts — outbox/types.ts needs it, and importing it
 * back from here would be circular since this file imports OutboxEntry from
 * that very module. Re-exported so existing importers do not change.
 */
export type { CheckInStatus };

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

/** Placeholder until Task 5 replaces it. See dispatchQueuedPinWrite in community-pins.ts. */
export async function dispatchQueuedCheckIn(entry: OutboxEntry): Promise<void> {
  throw new Error(`Check-ins are not wired up yet (${entry.id})`);
}
