import { NextResponse } from "next/server";
import webPush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Configure web-push with VAPID keys
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@weatherwell.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface PushPayload {
  title: string;
  body: string;
  zone: string;
  url?: string;
}

/**
 * POST /api/push
 *
 * Sends a Web Push notification to all subscribers for a zone.
 * Requires VAPID keys to be configured.
 *
 * Body: { zoneId: string, title: string, body: string, url?: string }
 */
export async function POST(request: Request) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return NextResponse.json(
      { error: "Push notifications not configured" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { zoneId, title, body: messageBody, url } = body;

  if (!zoneId || !title || !messageBody) {
    return NextResponse.json(
      { error: "zoneId, title, and body required" },
      { status: 400 }
    );
  }

  // Use service role to read subscriptions (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get subscriptions for this zone (and zone-less general subscriptions)
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions" as never)
    .select("endpoint, p256dh, auth")
    .or(`zone_id.eq.${zoneId},zone_id.is.null`) as { data: Array<{ endpoint: string; p256dh: string; auth: string }> | null; error: { message: string } | null };

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, message: "No subscribers" });
  }

  const payload: PushPayload = {
    title,
    body: messageBody,
    zone: zoneId,
    url: url ?? "/",
  };

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webPush.sendNotification(
        {
          endpoint: (sub as { endpoint: string }).endpoint,
          keys: {
            p256dh: (sub as { p256dh: string }).p256dh,
            auth: (sub as { auth: string }).auth,
          },
        },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err) {
      failed++;
      // If subscription is expired/invalid, remove it
      if ((err as { statusCode?: number }).statusCode === 404 || (err as { statusCode?: number }).statusCode === 410) {
        await supabase
          .from("push_subscriptions" as never)
          .delete()
          .eq("endpoint" as never, (sub as { endpoint: string }).endpoint);
      }
    }
  }

  return NextResponse.json({ sent, failed, total: subscriptions.length });
}

/**
 * GET /api/push
 *
 * Returns push configuration for client-side setup.
 */
export async function GET() {
  return NextResponse.json({
    supported: !!VAPID_PUBLIC_KEY && !!VAPID_PRIVATE_KEY,
    publicKey: VAPID_PUBLIC_KEY ?? null,
  });
}
