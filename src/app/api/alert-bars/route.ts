import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/alert-bars
 *
 * The barangays whose bar for an automatic advisory the calibration loop has
 * raised, as { zoneId: step }. Every other barangay is at step 0. Public, like
 * the reports it counts: the app tells residents how many more reports an
 * advisory needs. Small: most barangays never move.
 */
export async function GET() {
  const { data, error } = await createSupabaseServerClient()
    .from("zone_alert_floors")
    .select("zone_id, step")
    .gt("step", 0);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const bars = Object.fromEntries((data ?? []).map((row) => [row.zone_id, row.step]));
  return NextResponse.json(bars, { headers: { "Cache-Control": "public, s-maxage=60" } });
}
