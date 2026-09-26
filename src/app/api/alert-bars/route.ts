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
/** PostgREST answers at most this many rows a request. */
const PAGE = 1000;

export async function GET() {
  const supabase = createSupabaseServerClient();
  const bars: Record<string, number> = {};
  // Page until a short page: a single read stops at 1,000 raised bars, and
  // the rest would read as step 0, fewer reports than the engine needs.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("zone_alert_floors")
      .select("zone_id, step")
      .gt("step", 0)
      .order("zone_id")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    for (const row of data ?? []) bars[row.zone_id] = row.step;
    if (!data || data.length < PAGE) break;
  }
  return NextResponse.json(bars, { headers: { "Cache-Control": "public, s-maxage=60" } });
}
