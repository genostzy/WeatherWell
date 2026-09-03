const DEVICE_ID_KEY = "weatherwell.deviceId";

/**
 * PRD Anti-Abuse layer 5: a random device ID in localStorage raises the cost
 * of casual abuse (multiple votes/reports need multiple browsers/devices,
 * not just multiple clicks). No account, no server — generated once and
 * reused for the life of this browser's storage.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    // Private-mode or blocked storage: a fresh id every call still lets
    // the feature work, it just won't recognize this device next time.
    return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
