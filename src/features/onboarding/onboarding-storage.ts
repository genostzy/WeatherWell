export const ONBOARDED_KEY = "weatherwell.onboarded";

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
