"use client";

import { useSyncExternalStore } from "react";

/** Hydration happens once and never reverses, so there is nothing to subscribe to. */
function subscribe(): () => void {
  return () => {};
}

/**
 * False during server render and during hydration, true from the first
 * client-only render onwards.
 *
 * Use it to gate anything the server cannot compute the same way the browser
 * will — most often a value derived from the current clock. Rendering such a
 * value on the server produces HTML that disagrees with what React builds
 * during hydration, which React reports as a hydration mismatch and recovers
 * from by throwing away the server's markup for that subtree.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect` because React
 * uses `getServerSnapshot` for the hydration render too, so the gate is closed
 * at exactly the right moment without a setState-in-effect — the same reason
 * use-selected-zone.ts is built this way.
 */
export function useHasHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
