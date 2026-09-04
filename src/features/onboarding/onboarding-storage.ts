export const ONBOARDED_KEY = "weatherwell.onboarded";
const SELECTED_ZONE_KEY = "weatherwell.selectedZoneId";

/** Browser-only; safe to call from effects. Returns false during SSR. */
export function hasOnboarded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === "true";
  } catch {
    return false;
  }
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
