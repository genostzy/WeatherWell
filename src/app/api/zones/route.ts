import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toReferenceData } from "@/lib/reference-data/types";
import type { HazardType, PointOfInterest, Zone } from "@/lib/types";
import type { HazardLevel } from "@/lib/hazards";

/**
 * All reference data in one response. Route handlers are not cached by default
 * in this version of Next, which is what we want: the service worker owns
 * caching for this URL (stale-while-revalidate into an unversioned cache, so a
 * device that updates and then loses signal keeps its evacuation instructions).
 *
 * With ~42k zones, the PostgREST embed join (zones -> evacuation_centers)
 * is too slow and produces too large a response. Instead, we fetch all four
 * tables as flat parallel queries and merge them in JS.
 */
export async function GET() {
  const supabase = createSupabaseServerClient();

  const [zonesResult, centresResult, poisResult, hazardsResult] = await Promise.all([
    supabase
      .from("zones")
      .select(
        "id, psgc_barangay_code, name, municipality_name, province_name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number, downstream_zone_id"
      )
      .order("id")
      .limit(50000),
    supabase
      .from("evacuation_centers")
      .select("zone_id, name, lat, lng, capacity, status, current_occupancy")
      .limit(50000),
    supabase.from("points_of_interest").select("id, zone_id, category, name, lat, lng").order("id").limit(50000),
    supabase.from("hazard_susceptibility").select("zone_id, hazard_type, risk_level").limit(50000),
  ]);

  if (zonesResult.error) {
    return NextResponse.json({ error: zonesResult.error.message }, { status: 502 });
  }
  if (centresResult.error) {
    return NextResponse.json({ error: centresResult.error.message }, { status: 502 });
  }
  if (poisResult.error) {
    return NextResponse.json({ error: poisResult.error.message }, { status: 502 });
  }
  if (hazardsResult.error) {
    return NextResponse.json({ error: hazardsResult.error.message }, { status: 502 });
  }
  if (zonesResult.data.length === 0) {
    return NextResponse.json({ error: "zones query returned no rows" }, { status: 502 });
  }

  try {
    const centreByZone = new Map<string, (typeof centresResult.data)[number]>();
    for (const c of centresResult.data) {
      centreByZone.set(c.zone_id, c);
    }

    const zones = zonesResult.data.map((row) => {
      const centre = centreByZone.get(row.id) ?? null;
      return {
        ...row,
        evacuation_route_text: row.evacuation_route_text as Zone["evacuationRouteText"],
        evacuation_route_path: row.evacuation_route_path as Zone["evacuationRoutePath"],
        evacuation_centers: centre
          ? { ...centre, status: centre.status as Zone["centerStatus"] }
          : null,
      };
    });
    const pois = poisResult.data.map((row) => ({
      ...row,
      category: row.category as PointOfInterest["category"],
    }));
    const hazards = hazardsResult.data.map((row) => ({
      ...row,
      hazard_type: row.hazard_type as HazardType,
      risk_level: row.risk_level as HazardLevel,
    }));

    const data = toReferenceData(zones, pois, hazards);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
