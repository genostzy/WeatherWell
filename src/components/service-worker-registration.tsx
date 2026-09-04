"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production only.
 *
 * In development the worker is actively harmful: build output is not
 * content-hashed, so a cached chunk keeps being served under the same URL and
 * source edits silently stop appearing — a failure that looks like a bug in
 * whatever you were working on rather than a caching problem, and costs far
 * more to diagnose than the offline behaviour is worth locally.
 *
 * Unregistering rather than merely skipping matters too: anyone whose browser
 * already installed a worker from an earlier dev session stays stuck with it
 * otherwise, because a registered worker keeps serving whether or not this
 * component ever calls register() again.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then(async (registrations) => {
          for (const registration of registrations) await registration.unregister();
          // Unregistering stops the worker controlling future navigations but
          // leaves its caches behind, so drop those too — otherwise the stale
          // entries survive and the next worker to install inherits them.
          for (const key of await caches.keys()) {
            if (key.startsWith("weatherwell-")) await caches.delete(key);
          }
        })
        .catch(() => {
          // Nothing to clean up, or the browser refused. Either is fine.
        });
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failed — the app still works, just without offline caching.
    });
  }, []);

  return null;
}
