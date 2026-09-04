"use client";

import { getDeviceId } from "./device-id";
import { createLocalStorageStore } from "./local-storage-store";
import type { PinStatusTag } from "./community-pin";

const VOTES_KEY = "weatherwell.communityPinVotes";

/** Net-score removal threshold — PRD Anti-Abuse layer 10: downvotes exceeding upvotes by this much removes the pin. */
const NET_SCORE_REMOVAL_THRESHOLD = 5;

export type PinRemovalReason = "net_score" | "admin";

export interface CommunityPin {
  id: string;
  zoneId: string;
  statusTag: PinStatusTag;
  /** Free text typed by the resident — never auto-translated, unlike the app's own LocalizedText copy. */
  caption: string;
  /** Phase 1: a local data URL only, never uploaded to any backend (PRD Core Feature #5). */
  photoDataUrl?: string;
  lat: number;
  lng: number;
  upvotes: number;
  downvotes: number;
  createdAt: string;
  deviceId: string;
  /**
   * Soft-delete, not a filter-out: PRD says admin can "remove or restore any
   * pin" — a net-score removal is a fast automated response, not final,
   * exactly like the alert pipeline's own Human Override. A hard delete would
   * make that promise false, so removed pins stay in storage, just hidden
   * from the public map (see useCommunityPins).
   */
  removed?: boolean;
  removedReason?: PinRemovalReason;
}

/**
 * Ships with the app so a fresh install already shows realistic mock
 * activity (Phase 1 exit criteria) instead of an empty layer — also gives
 * the pre-staged public/mock/community-pin-example.jpg a purpose. Offset
 * slightly from their zone's own marker so they read as distinct points.
 */
const SEED_COMMUNITY_PINS: CommunityPin[] = [
  {
    id: "pin-seed-1",
    zoneId: "zone-2",
    statusTag: "flooded",
    caption: "Alagang-tuhod na ang baha sa may palengke, iwasan muna.",
    photoDataUrl: "/mock/community-pin-example.jpg",
    lat: 16.0698,
    lng: 120.4045,
    upvotes: 6,
    downvotes: 1,
    createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    deviceId: "seed-device-1",
  },
  {
    id: "pin-seed-2",
    zoneId: "zone-3",
    statusTag: "impassable",
    caption: "Road near the bridge is impassable, water above the tires.",
    lat: 16.0441,
    lng: 120.4869,
    upvotes: 3,
    downvotes: 0,
    createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    deviceId: "seed-device-2",
  },
];

const pinsStore = createLocalStorageStore<CommunityPin[]>(
  "weatherwell.communityPins",
  "weatherwell:community-pins-changed",
  SEED_COMMUNITY_PINS
);

type VotesMap = Record<string, 1 | -1>;

const votesStore = createLocalStorageStore<VotesMap>(
  VOTES_KEY,
  "weatherwell:community-pin-votes-changed",
  {}
);

/** Active pins only — what the public map and KPI counts show. Re-renders whenever any pin is added, voted on, removed, or restored. */
export function useCommunityPins(): CommunityPin[] {
  const all = pinsStore.useStore();
  return all.filter((pin) => !pin.removed);
}

/** Every pin including removed ones — for admin moderation, where a removed pin must still be visible to restore. */
export function useAllCommunityPins(): CommunityPin[] {
  return pinsStore.useStore();
}

export function addCommunityPin(input: {
  zoneId: string;
  statusTag: PinStatusTag;
  caption: string;
  lat: number;
  lng: number;
  photoDataUrl?: string;
}): void {
  const pin: CommunityPin = {
    id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    zoneId: input.zoneId,
    statusTag: input.statusTag,
    caption: input.caption,
    photoDataUrl: input.photoDataUrl,
    lat: input.lat,
    lng: input.lng,
    upvotes: 0,
    downvotes: 0,
    createdAt: new Date().toISOString(),
    deviceId: getDeviceId(),
  };
  pinsStore.update((pins) => [...pins, pin]);
}

/**
 * Whether this device created the pin — the only handle Phase 1 has on
 * authorship (no accounts, PRD Anti-Abuse layer 5). Edit and delete are
 * offered only for a resident's own pins; an admin override to remove
 * anyone's pin lives on the admin dashboard instead, per PRD Core Feature #5.
 */
export function isOwnPin(pin: CommunityPin): boolean {
  return pin.deviceId === getDeviceId();
}

export function updateCommunityPin(
  pinId: string,
  patch: { statusTag?: PinStatusTag; caption?: string; photoDataUrl?: string }
): void {
  pinsStore.update((pins) =>
    pins.map((pin) => {
      if (pin.id !== pinId) return pin;
      return {
        ...pin,
        statusTag: patch.statusTag ?? pin.statusTag,
        caption: patch.caption ?? pin.caption,
        // An explicit empty string clears the photo; undefined leaves it alone.
        photoDataUrl: patch.photoDataUrl === "" ? undefined : patch.photoDataUrl ?? pin.photoDataUrl,
      };
    })
  );
}

/**
 * A resident permanently removing their own pin (gated by isOwnPin at the
 * call site) — their own choice about their own content, not part of the
 * anti-abuse safety net, so unlike admin/net-score removal there's nothing
 * to restore.
 */
export function deleteOwnPin(pinId: string): void {
  pinsStore.update((pins) => pins.filter((pin) => pin.id !== pinId));
}

/** Admin's own manual removal — PRD Anti-Abuse layer 7/10's human override. Soft-delete so it can be undone via restoreCommunityPin. */
export function removePinByAdmin(pinId: string): void {
  pinsStore.update((pins) =>
    pins.map((pin) => (pin.id === pinId ? { ...pin, removed: true, removedReason: "admin" as const } : pin))
  );
}

/** Clears a removal (net-score or admin) — the other half of "admin can remove or restore any pin". */
export function restoreCommunityPin(pinId: string): void {
  pinsStore.update((pins) =>
    pins.map((pin) => (pin.id === pinId ? { ...pin, removed: false, removedReason: undefined } : pin))
  );
}

/**
 * One vote per device per pin — PRD Anti-Abuse layer 10 (mock/UI-only in
 * Phase 1; real geofence + rate-limit enforcement lands Phase 3). Plain
 * function, not a hook: today's only call site (map-canvas.tsx) reads this
 * inline inside a component already subscribed to useCommunityPins(), which
 * re-renders on every vote anyway. A consumer that isn't already re-rendering
 * off one of these stores would need a reactive wrapper over votesStore.
 */
export function hasVotedOnPin(pinId: string): boolean {
  return pinId in votesStore.getSnapshot();
}

/**
 * Casts a vote and applies net-score removal in one step (downvotes
 * exceeding upvotes by NET_SCORE_REMOVAL_THRESHOLD removes the pin) — a
 * well-corroborated pin isn't killed by a handful of bad-faith downvotes,
 * per PRD Anti-Abuse layer 10. Removal is a soft delete (see CommunityPin.removed)
 * so admin can restore a pin a brigading attack took down wrongly — the same
 * Human Override principle the alert pipeline already has. No-ops if this
 * device already voted on this pin.
 * PRD also calls for notifying the pin's creator on removal by "reusing the
 * push-notification pipeline" — deferred, since Phase 1 has no real push
 * infrastructure for a resident-side removal notice to reuse yet.
 */
export function voteOnPin(pinId: string, direction: 1 | -1): void {
  if (pinId in votesStore.getSnapshot()) return;

  pinsStore.update((pins) =>
    pins.map((pin) => {
      if (pin.id !== pinId) return pin;
      const upvotes = pin.upvotes + (direction === 1 ? 1 : 0);
      const downvotes = pin.downvotes + (direction === -1 ? 1 : 0);
      const netRemoved = downvotes - upvotes >= NET_SCORE_REMOVAL_THRESHOLD;
      return {
        ...pin,
        upvotes,
        downvotes,
        removed: netRemoved || pin.removed,
        removedReason: netRemoved ? "net_score" : pin.removedReason,
      };
    })
  );
  votesStore.update((votes) => ({ ...votes, [pinId]: direction }));
}
