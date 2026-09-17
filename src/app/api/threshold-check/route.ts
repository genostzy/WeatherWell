import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * POST /api/threshold-check
 *
 * Checks all zones for threshold-triggered alerts and sends push notifications.
 * Designed to be called by a cron job (Vercel Cron or external scheduler).
 *
 * Flow:
 * 1. Run check_and_trigger_alerts() to create/update alerts
 * 2. For each triggered alert, send push notifications to zone subscribers
 */
export async function POST() {
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
    try {
      const pushResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/push`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zoneId: alert.zone_id,
            title: `WeatherWell Alert — ${alert.severity.toUpperCase()}`,
            body: `Crowd reports indicate ${alert.severity} level flooding in your area.`,
            url: `/`,
          }),
        }
      );

      if (pushResponse.ok) {
        const { sent } = await pushResponse.json();
        pushSent += sent ?? 0;
      }
    } catch {
      // Push failure shouldn't block alert creation
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
 * Returns the current configuration (for monitoring/debugging).
 */
export async function GET() {
  return NextResponse.json({
    minReports: 3,
    windowHours: 6,
    depthThreshold: "ankle",
    status: "configured",
  });
}
