import { useSyncExternalStore } from "react";

export const ONBOARDED_KEY = "weatherwell.onboarded";
const SELECTED_ZONE_KEY = "weatherwell.selectedZoneId";
const CONSENT_KEY = "weatherwell.consent";

/**
 * The consent notice's version: the day its text last changed what is
 * collected (CONSENT_ITEMS). A resident who accepted an older one counts as
 * not onboarded, so the gate shows them the new one: RA 10173 consent is to
 * what is collected now, not to what used to be.
 */
export const CONSENT_VERSION = "2026-09-25";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Browser-only; safe to call from effects. Returns false during SSR. */
export function hasOnboarded(): boolean {
  return read(ONBOARDED_KEY) === "true" && hasConsented();
}

/** Accepted the current consent notice on this device. */
export function hasConsented(): boolean {
  return read(CONSENT_KEY) === CONSENT_VERSION;
}

export function markConsented(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_KEY, CONSENT_VERSION);
  } catch {
    // Private-mode or blocked storage: the user simply sees the notice again.
  }
}

/** Picked a barangay under an earlier notice: accepting the new one is all that is left. */
export function hasFinishedSetupBefore(): boolean {
  return read(ONBOARDED_KEY) === "true" && getSelectedZoneId() !== null;
}

/**
 * localStorage is only written by the onboarding flow, which navigates away
 * from any page reading this, so there is nothing to subscribe to — the
 * snapshot is read once per mount.
 */
function subscribe(): () => void {
  return () => {};
}

/** Server render can't see localStorage: "not yet known" (null), not a guess. */
function getServerSnapshot(): boolean | null {
  return null;
}

/**
 * Reactive, hydration-safe read of hasOnboarded(): server and the client's
 * first paint both see `null` ("not yet known"), so there is nothing for
 * them to disagree on. A plain `hasOnboarded()` call during render would
 * return `false` on the server (no `window`) but the real value on the
 * client's first paint — a hydration mismatch for any returning,
 * already-onboarded resident. This resolves to the real value one render
 * later, after hydration, like any other useSyncExternalStore read.
 */
export function useHasOnboarded(): boolean | null {
  return useSyncExternalStore<boolean | null>(subscribe, hasOnboarded, getServerSnapshot);
}

export function markOnboarded(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDED_KEY, "true");
  } catch {
    // Private-mode or blocked storage: the user simply sees onboarding again.
  }
}

/** Browser-only; returns null during SSR or when nothing has been picked yet. */
export function getSelectedZoneId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SELECTED_ZONE_KEY);
  } catch {
    return null;
  }
}

export function setSelectedZoneId(zoneId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SELECTED_ZONE_KEY, zoneId);
  } catch {
    // Private-mode or blocked storage: callers fall back to the default zone.
  }
}
