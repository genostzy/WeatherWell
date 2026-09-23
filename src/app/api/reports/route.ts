import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LiveWaterLevelReport } from "@/lib/water-level-reports";

/**
 * Recent water-level reports, newest first. Public: the count of neighbours
 * reporting is what makes the signal trustworthy, so this uses the public
 * client rather than the user client — reports carry `select using (true)`
 * and a public read should not be coupled to a session.
 */
export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("water_level_reports")
    .select("id, zone_id, depth_level, reported_at, trust_weight, is_outlier")
    .order("reported_at", { ascending: false })
    .limit(200);

  // Never 200 with an empty list on failure — "no reports" reads as "nobody
  // is reporting" to whoever is looking.
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  // `depth_level` is a CHECK-constrained `text` column rather than a Postgres
  // enum, so the generated type renders it as `string`. This narrows exactly
  // that one field to the literal union the CHECK constraint already
  // guarantees at runtime — same per-field pattern as /api/zones and
  // /api/alerts, never a whole-result cast.
  const reports: LiveWaterLevelReport[] = data.map((row) => ({
    id: row.id,
    zoneId: row.zone_id,
    depthLevel: row.depth_level as LiveWaterLevelReport["depthLevel"],
    reportedAt: row.reported_at,
    trustWeight: Number(row.trust_weight),
    isOutlier: row.is_outlier,
  }));

  return NextResponse.json(reports);
}
