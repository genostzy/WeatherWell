"use client";

import { useSyncExternalStore } from "react";

/**
 * Creates a reactive localStorage-backed store using React's useSyncExternalStore.
 *
 * This eliminates the duplicated readRaw → getSnapshot (with cache) →
 * getServerSnapshot → subscribe → useSyncExternalStore pattern across
 * zone-overrides.ts, community-pins.ts, and water-level-reports.ts.
 *
 * @param key - localStorage key
 * @param eventName - custom event name for same-tab reactivity
 * @param defaultValue - value to return when localStorage is empty or parsing fails
 */
export function createLocalStorageStore<T>(key: string, eventName: string, defaultValue: T) {
  function readRaw(): string | null {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  // getSnapshot must return a referentially stable value when nothing changed
  // (a React/useSyncExternalStore requirement) — cache the parsed value and
  // only produce a new one when the underlying raw JSON actually differs.
  let cachedRaw: string | null | undefined = undefined;
  let cachedParsed: T = defaultValue;

  function getSnapshot(): T {
    const raw = readRaw();
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      if (raw === null) {
        cachedParsed = defaultValue;
      } else {
        try {
          cachedParsed = JSON.parse(raw) as T;
        } catch {
          cachedParsed = defaultValue;
        }
      }
    }
    return cachedParsed;
  }

  function getServerSnapshot(): T {
    return defaultValue;
  }

  function write(value: T): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      // storage events only fire in OTHER tabs/windows, never the one that
      // wrote — dispatch our own so same-tab consumers re-render too.
      window.dispatchEvent(new Event(eventName));
    } catch {
      // Private-mode or blocked storage: the write just doesn't persist/broadcast.
    }
  }

  function subscribe(callback: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(eventName, callback);
    window.addEventListener("storage", callback);
    return () => {
      window.removeEventListener(eventName, callback);
      window.removeEventListener("storage", callback);
    };
  }

  function useStore(): T {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  }

  return { useStore, getSnapshot, write, subscribe };
}
