"use client";

import { useState, useEffect, useCallback } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { ensureAnonymousSession } from "@/lib/auth/anonymous-session";

/**
 * Convert a VAPID public key from base64url to Uint8Array
 * for the PushManager.subscribe() call.
 */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

interface PushSubscriptionState {
  isSupported: boolean;
  permission: NotificationPermission;
  subscription: PushSubscription | null;
  isLoading: boolean;
}

const UNSUPPORTED_STATE: PushSubscriptionState = {
  isSupported: false,
  permission: "default",
  subscription: null,
  isLoading: false,
};

/** Saves (or re-saves) a browser push subscription under a barangay. True only when the row was written. */
async function saveSubscription(sub: PushSubscription, zoneId: string): Promise<boolean> {
  const userId = await ensureAnonymousSession();
  if (!userId) return false;

  const { endpoint, keys } = sub.toJSON();
  const { error } = await getBrowserClient()
    .from("push_subscriptions" as never)
    .upsert(
      {
        user_id: userId,
        endpoint: endpoint ?? "",
        p256dh: keys?.p256dh ?? "",
        auth: keys?.auth ?? "",
        zone_id: zoneId,
        user_agent: navigator.userAgent,
      } as never,
      { onConflict: "user_id,endpoint" } as never
    );
  return !error;
}

/**
 * What subscribe() came to. Every way it can stop is named, so the button
 * can say why instead of quietly ending its spinner (found testing push on
 * a phone: nothing was saved and nothing was said).
 */
export type SubscribeResult = "subscribed" | "no-zone" | "not-configured" | "no-session" | "denied" | "failed";

/**
 * Hook to manage Web Push subscription lifecycle.
 * Handles permission request, subscription creation, and server-side storage.
 */
export function usePushSubscription(zoneId?: string): {
  state: PushSubscriptionState;
  subscribe: () => Promise<SubscribeResult>;
  unsubscribe: () => Promise<void>;
} {
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  const isSupported =
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  useEffect(() => {
    if (!isSupported) return;
    let cancelled = false;

    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((sub) => {
        if (cancelled) return;
        setSubscription(sub);
        setPermission(Notification.permission);
        // Re-save an existing browser subscription: heals a device whose
        // earlier save failed or never happened, and follows a change of
        // barangay. The upsert is idempotent.
        if (sub && zoneId) void saveSubscription(sub, zoneId);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [isSupported, zoneId]);

  const subscribe = useCallback(async (): Promise<SubscribeResult> => {
    // Without a barangay there is nothing to target: the column is NOT NULL,
    // and a zone-less subscription used to receive every barangay's alerts.
    if (!zoneId) return "no-zone";

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.error("VAPID public key not configured");
      return "not-configured";
    }

    // A resident who has never filed a report has no session yet, and
    // without one the subscription had nowhere to be saved: it was silently
    // dropped. Asking before the permission prompt also means an offline
    // resident is never shown "subscribed" for a subscription that was not
    // saved.
    const userId = await ensureAnonymousSession();
    if (!userId) return "no-session";

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") return "denied";

    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      if (!(await saveSubscription(sub, zoneId))) {
        // Undo the browser side too: otherwise the next load finds this
        // subscription and shows "subscribed" with no row behind it.
        await sub.unsubscribe();
        return "failed";
      }

      setSubscription(sub);
      return "subscribed";
    } catch (error) {
      // The push service refused or is unreachable (some browsers have none).
      console.error("Push subscription failed", error);
      return "failed";
    }
  }, [zoneId]);

  const unsubscribe = useCallback(async () => {
    const sub = await navigator.serviceWorker.ready.then((r) =>
      r.pushManager.getSubscription()
    );

    if (sub) {
      // Remove from server
      const supabase = getBrowserClient();
      await supabase
        .from("push_subscriptions" as never)
        .delete()
        .eq("endpoint" as never, sub.endpoint);

      // Unsubscribe from push
      await sub.unsubscribe();
    }

    setSubscription(null);
  }, []);

  const state: PushSubscriptionState = isSupported
    ? { isSupported: true, permission, subscription, isLoading: false }
    : UNSUPPORTED_STATE;

  return { state, subscribe, unsubscribe };
}
