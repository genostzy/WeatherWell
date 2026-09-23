import "server-only";
import webPush from "web-push";
import { createClient } from "@supabase/supabase-js";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@weatherwell.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/** Zone IDs are always "zone-" plus digits (demo) or a PSGC code (nationwide) — never punctuation a PostgREST filter string would treat specially. */
const VALID_ZONE_ID = /^zone-[0-9A-Za-z]+$/;

export interface ZonePushPayload {
  zoneId: string;
  title: string;
  body: string;
  url?: string;
}

export type ZonePushResult =
  | { ok: true; sent: number; failed: number; total: number }
  | { ok: false; error: string; status: number };

/**
 * Sends a Web Push notification to every subscriber of a zone.
 *
 * Called directly by the threshold-check cron rather than over HTTP: an
 * internal server-to-server fetch back into this app's own API needs a base
 * URL (NEXT_PUBLIC_APP_URL, easy to leave unset on a new deploy) and, if that
 * endpoint is going to work at all for that fetch, it has to be reachable by
 * anyone — the exact hole that let an unauthenticated caller push arbitrary
 * text to any zone's subscribers. Calling the function in-process needs
 * neither.
 */
export async function sendZonePush(payload: ZonePushPayload): Promise<ZonePushResult> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { ok: false, error: "Push notifications not configured", status: 503 };
  }

  if (!VALID_ZONE_ID.test(payload.zoneId)) {
    return { ok: false, error: "Invalid zoneId", status: 400 };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: subscriptions, error } = (await supabase
    .from("push_subscriptions" as never)
    .select("endpoint, p256dh, auth")
    .eq("zone_id" as never, payload.zoneId)) as {
    data: Array<{ endpoint: string; p256dh: string; auth: string }> | null;
    error: { message: string } | null;
  };

  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }

  if (!subscriptions || subscriptions.length === 0) {
    return { ok: true, sent: 0, failed: 0, total: 0 };
  }

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    zone: payload.zoneId,
    url: payload.url ?? "/",
  });

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        message
      );
      sent++;
    } catch (err) {
      failed++;
      // Expired/invalid subscription — stop sending to it.
      if ((err as { statusCode?: number }).statusCode === 404 || (err as { statusCode?: number }).statusCode === 410) {
        await supabase.from("push_subscriptions" as never).delete().eq("endpoint" as never, sub.endpoint);
      }
    }
  }

  return { ok: true, sent, failed, total: subscriptions.length };
}
