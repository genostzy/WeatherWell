"use client";

import { useSyncExternalStore } from "react";

/**
 * Installing is not a nice-to-have for this app — it is the precondition for
 * the thing it promises. Alerts and evacuation instructions only survive an
 * outage because they are already on the device, and a resident cannot
 * download anything once the towers are down. So the app has to ask while
 * there is still signal, and has to be honest about how, because the answer
 * differs by browser.
 *
 * Chromium fires `beforeinstallprompt`, which can be captured and replayed
 * later against a real install dialog. iOS Safari fires nothing and has no
 * programmatic install at all — the only route is Share → Add to Home Screen,
 * so there the app explains the steps rather than pretending to a button that
 * cannot work.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallMethod =
  /** A real install dialog is available and can be opened on demand. */
  | "prompt"
  /** iOS Safari: no programmatic install; the Share-sheet steps are the answer. */
  | "ios-manual"
  /** Some other browser with no captured event — point at its own menu. */
  | "browser-menu"
  /** Already running as an installed app; there is nothing to ask for. */
  | "installed";

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const subscriber of subscribers) subscriber();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Chromium's own mini-infobar competes with onboarding and gives none of
    // the reasoning below, so it is suppressed and the event kept for later.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayMode = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  // iOS predates the display-mode media query for home-screen apps.
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return displayMode || iosStandalone;
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function getMethod(): InstallMethod {
  if (isStandalone()) return "installed";
  if (deferredPrompt) return "prompt";
  if (isIos()) return "ios-manual";
  return "browser-menu";
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** The server cannot know any of this, so it renders the most conservative answer. */
function getServerMethod(): InstallMethod {
  return "browser-menu";
}

export function useInstallMethod(): InstallMethod {
  return useSyncExternalStore(subscribe, getMethod, getServerMethod);
}

/**
 * Opens the browser's real install dialog. Resolves to whether the app was
 * installed; `false` covers both a declined dialog and there being no dialog
 * to open, since the caller's next step is the same either way.
 */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const event = deferredPrompt;
  // A captured prompt is single-use; drop it before awaiting so a double click
  // cannot fire the same event twice.
  deferredPrompt = null;
  notify();

  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === "accepted";
  } catch {
    return false;
  }
}
