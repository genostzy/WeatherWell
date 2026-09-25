import "server-only";
import webPush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@weatherwell.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/** Zone IDs are always "zone-" plus digits (demo) or a PSGC code (nationwide) — never punctuation a PostgREST filter string would treat specially. */
const VALID_ZONE_ID = /^zone-[0-9A-Za-z]+$/;

/**
 * The browsers' own push services (I5). A subscription row is written by the
 * browser, but nothing stops a caller writing any URL there, and this server
 * would then POST to it — an internal address, or a host that never answers.
 * Anything else is dropped unsent.
 */
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
];

function isPushServiceEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

const SEND_TIMEOUT_MS = 10_000;

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

  return deliver(supabase, subscriptions, {
    title: payload.title,
    body: payload.body,
    zone: payload.zoneId,
    url: payload.url ?? "/",
  });
}

type Subscription = { endpoint: string; p256dh: string; auth: string };
type ServiceClient = SupabaseClient;

/** Sends one message to each subscription (one per endpoint), dropping any that are dead or not a push service. */
async function deliver(supabase: ServiceClient, subscriptions: Subscription[], payload: object): Promise<ZonePushResult> {
  const unique = [...new Map(subscriptions.map((sub) => [sub.endpoint, sub])).values()];
  const message = JSON.stringify(payload);

  const dropSubscription = (endpoint: string) =>
    supabase.from("push_subscriptions" as never).delete().eq("endpoint" as never, endpoint);

  // In parallel, each with its own timeout: one slow push service must not
  // delay everyone after it. ponytail: unbounded concurrency, fine at
  // barangay scale; batch it if a zone ever has thousands of subscribers.
  const results = await Promise.allSettled(
    unique.map(async (sub) => {
      if (!isPushServiceEndpoint(sub.endpoint)) {
        await dropSubscription(sub.endpoint);
        throw new Error("not a push service endpoint");
      }
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message,
          { timeout: SEND_TIMEOUT_MS }
        );
      } catch (err) {
        // Expired/invalid subscription — stop sending to it.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await dropSubscription(sub.endpoint);
        throw err;
      }
    })
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { ok: true, sent, failed: results.length - sent, total: unique.length };
}

/**
 * Sends to every device of the given accounts, whichever barangay each
 * device follows: how officials hear about updates and advisories that need
 * them (see official-recipients.ts for who).
 */
export async function sendUsersPush(payload: { userIds: string[]; title: string; body: string; url?: string }): Promise<ZonePushResult> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { ok: false, error: "Push notifications not configured", status: 503 };
  }
  if (payload.userIds.length === 0) return { ok: true, sent: 0, failed: 0, total: 0 };

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = (await supabase
    .from("push_subscriptions" as never)
    .select("endpoint, p256dh, auth")
    .in("user_id" as never, payload.userIds as never)) as { data: Subscription[] | null; error: { message: string } | null };
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data || data.length === 0) return { ok: true, sent: 0, failed: 0, total: 0 };

  return deliver(supabase, data, { title: payload.title, body: payload.body, zone: "", url: payload.url ?? "/admin" });
}

