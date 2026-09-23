import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendZonePush } from "@/lib/send-zone-push";

export const dynamic = "force-dynamic";

/**
 * Checks all zones for threshold-triggered alerts and sends push notifications.
 *
 * Flow:
 * 1. Run check_and_trigger_alerts() to create/update alerts
 * 2. For each triggered alert, send push notifications to zone subscribers
 */
async function runThresholdCheck(): Promise<NextResponse> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Run the threshold engine
  const { data: results, error: engineError } = await supabase
    .rpc("check_and_trigger_alerts" as never) as { data: Array<{ zone_id: string; severity: string; report_count: number; triggered: boolean }> | null; error: { message: string } | null };

  if (engineError) {
    return NextResponse.json({ error: engineError.message }, { status: 500 });
  }

  if (!results || results.length === 0) {
    return NextResponse.json({ triggered: 0, message: "No alerts triggered" });
  }

  // Send push notifications for triggered alerts
  const triggeredAlerts = results.filter((r) => r.triggered);

  let pushSent = 0;

  for (const alert of triggeredAlerts) {
    // Called directly rather than over HTTP — see sendZonePush's own doc
    // comment for why that used to be both a reliability and a security bug.
    const result = await sendZonePush({
      zoneId: alert.zone_id,
      // Automatic alerts are always an unverified yellow advisory (see the
      // alert_engine_integrity migration); the push must not claim more.
      title: "WeatherWell Advisory (unverified)",
      body: "Residents report flooding in your area. Not yet confirmed by an official.",
      url: `/`,
    });

    if (result.ok) {
      pushSent += result.sent;
    } else {
      // The alert itself is already written — a push failure for one zone
      // must not stop the loop from reaching the rest.
      console.error(`sendZonePush failed for zone ${alert.zone_id}: ${result.error}`);
    }
  }

  return NextResponse.json({
    triggered: triggeredAlerts.length,
    pushSent,
    results: triggeredAlerts,
  });
}

/**
 * GET /api/threshold-check
 *
 * Vercel Cron always sends GET, never POST — this was previously a stub
 * that echoed static config, which meant the daily scheduled run in
 * vercel.json never actually executed the threshold engine below. GET now
 * runs the real check; POST is kept as an equivalent manually-triggerable
 * path. Both require the same cron secret.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runThresholdCheck();
}

/** POST /api/threshold-check — see GET's doc comment. */
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runThresholdCheck();
}
