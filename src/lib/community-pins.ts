"use client";

import { useSyncExternalStore } from "react";
import { getDeviceId } from "./device-id";
import type { PinStatusTag } from "./community-pin";

const PINS_KEY = "weatherwell.communityPins";
const VOTES_KEY = "weatherwell.communityPinVotes";
const PINS_EVENT = "weatherwell:community-pins-changed";

/** Net-score removal threshold — PRD Anti-Abuse layer 10: downvotes exceeding upvotes by this much removes the pin. */
const NET_SCORE_REMOVAL_THRESHOLD = 5;

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

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

// getSnapshot must return a referentially stable value when nothing changed
// (a React/useSyncExternalStore requirement) — same cache-by-raw-JSON
// approach as zone-overrides.ts.
let cachedRaw: string | null | undefined = undefined;
let cachedParsed: CommunityPin[] = SEED_COMMUNITY_PINS;

function getSnapshot(): CommunityPin[] {
  const raw = readRaw(PINS_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    if (raw === null) {
      cachedParsed = SEED_COMMUNITY_PINS;
    } else {
      try {
        cachedParsed = JSON.parse(raw) as CommunityPin[];
      } catch {
        cachedParsed = SEED_COMMUNITY_PINS;
      }
    }
  }
  return cachedParsed;
}

function getServerSnapshot(): CommunityPin[] {
  return SEED_COMMUNITY_PINS;
}

function writePins(pins: CommunityPin[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PINS_KEY, JSON.stringify(pins));
    // storage events only fire in OTHER tabs — dispatch our own so same-tab
    // consumers (e.g. the map right after a vote) re-render too.
    window.dispatchEvent(new Event(PINS_EVENT));
  } catch {
    // Private-mode or blocked storage: the edit just doesn't persist/broadcast.
  }
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PINS_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(PINS_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** All live community pins — re-renders whenever any pin is added, voted on, or removed by net score. */
export function useCommunityPins(): CommunityPin[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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
  writePins([...getSnapshot(), pin]);
}

function readVotes(): Record<string, 1 | -1> {
  const raw = readRaw(VOTES_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, 1 | -1>;
  } catch {
    return {};
  }
}

function writeVotes(votes: Record<string, 1 | -1>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VOTES_KEY, JSON.stringify(votes));
  } catch {
    // Private-mode or blocked storage: this device just won't be remembered.
  }
}

/** One vote per device per pin — PRD Anti-Abuse layer 10 (mock/UI-only in Phase 1; real geofence + rate-limit enforcement lands Phase 3). */
export function hasVotedOnPin(pinId: string): boolean {
  return pinId in readVotes();
}

/**
 * Casts a vote and applies net-score removal in one step (downvotes
 * exceeding upvotes by NET_SCORE_REMOVAL_THRESHOLD removes the pin) — a
 * well-corroborated pin isn't killed by a handful of bad-faith downvotes,
 * per PRD Anti-Abuse layer 10. No-ops if this device already voted on this pin.
 * PRD also calls for notifying the pin's creator on removal by "reusing the
 * push-notification pipeline" — deferred, since Phase 1 has no real push
 * infrastructure for a resident-side removal notice to reuse yet.
 */
export function voteOnPin(pinId: string, direction: 1 | -1): void {
  const votes = readVotes();
  if (pinId in votes) return;

  const next = getSnapshot()
    .map((pin) =>
      pin.id === pinId
        ? {
            ...pin,
            upvotes: pin.upvotes + (direction === 1 ? 1 : 0),
            downvotes: pin.downvotes + (direction === -1 ? 1 : 0),
          }
        : pin
    )
    .filter((pin) => pin.downvotes - pin.upvotes < NET_SCORE_REMOVAL_THRESHOLD);

  votes[pinId] = direction;
  writeVotes(votes);
  writePins(next);
}
