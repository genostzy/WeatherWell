import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HazardLevel } from "@/lib/hazards";
import type { ProfileOverlayRow } from "@/lib/reference-data/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/barangay-profiles
 *
 * The barangays whose officials set their flood, landslide and storm-surge
 * levels and downstream barangay (set_barangay_profile), for the
 * reference-data provider to lay over the static file (applyProfileOverlay).
 * Public, like the zones and hazard tables it reads. The service worker keeps
 * a copy, so the Hazards layer shows them offline too.
 */
/** PostgREST answers at most this many rows a request. */
const PAGE = 1000;

interface DbRow {
  id: string;
  downstream_zone_id: string | null;
  hazard_susceptibility: { hazard_type: string; risk_level: HazardLevel }[];
}

export async function GET() {
  const supabase = createSupabaseServerClient();
  const rows: ProfileOverlayRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("zones")
      .select("id, downstream_zone_id, hazard_susceptibility(hazard_type, risk_level)")
      .not("profile_set_at", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    for (const row of (data ?? []) as unknown as DbRow[]) {
      const level = (type: string) =>
        row.hazard_susceptibility.find((h) => h.hazard_type === type)?.risk_level ?? "unknown";
      rows.push({
        id: row.id,
        flood: level("flood"),
        landslide: level("landslide"),
        storm_surge: level("storm_surge"),
        downstream_zone_id: row.downstream_zone_id,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return NextResponse.json(rows, { headers: { "Cache-Control": "public, s-maxage=30" } });
}
