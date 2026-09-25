import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sendZonePush } from "@/lib/send-zone-push";
import { notifyOfficialsOfAdvisory } from "@/lib/notify-officials";
import { emailResidentsOfAdvisory } from "@/lib/notify-residents";

type EngineRow = { zone_id: string; severity: string; report_count: number; triggered: boolean };

export type ThresholdCheckResult =
  | { ok: true; triggered: number; pushSent: number; results: EngineRow[] }
  | { ok: false; error: string };

/**
 * Runs the crowd-report alert engine (service role only) and pushes each
 * newly raised advisory to that barangay's subscribers. Called by the cron
 * route and, right after a report is saved, by submitWaterLevelReport — so a
 * flood reported now is evaluated now, not at the next scheduled run.
 */
export async function runThresholdCheck(): Promise<ThresholdCheckResult> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: results, error } = (await supabase.rpc("check_and_trigger_alerts" as never)) as {
    data: EngineRow[] | null;
    error: { message: string } | null;
  };
  if (error) return { ok: false, error: error.message };

  const triggeredAlerts = (results ?? []).filter((r) => r.triggered);
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
      url: "/",
    });
    if (result.ok) {
      pushSent += result.sent;
    } else {
      // The alert itself is already written — a push failure for one zone
      // must not stop the loop from reaching the rest.
      console.error(`sendZonePush failed for zone ${alert.zone_id}: ${result.error}`);
    }
    // Residents who turned email alerts on, and the officials who must
    // confirm or reject it, hear about it too.
    await emailResidentsOfAdvisory(alert.zone_id);
    await notifyOfficialsOfAdvisory(alert.zone_id);
  }

  return { ok: true, triggered: triggeredAlerts.length, pushSent, results: triggeredAlerts };
}
