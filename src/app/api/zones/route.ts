import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toReferenceData } from "@/lib/reference-data/types";
import type { HazardType, PointOfInterest, Zone } from "@/lib/types";
import type { HazardLevel } from "@/lib/hazards";

/**
 * Reference data endpoint. With ~42k zones, even flat queries with
 * evacuation_centers exceed Vercel's ~4.5 MB payload limit on Hobby.
 *
 * Evacuation center details are loaded on-demand when the resident
 * opens evacuation instructions. This keeps the initial payload small
 * enough for the Hobby plan.
 */
export async function GET() {
  const supabase = createSupabaseServerClient();

  const [zonesResult, poisResult, hazardsResult] = await Promise.all([
    supabase
      .from("zones")
      .select("id, psgc_barangay_code, name, municipality_name, province_name, lat, lng, downstream_zone_id")
      .order("id")
      .limit(50000),
    supabase.from("points_of_interest").select("id, zone_id, category, name, lat, lng").order("id").limit(50000),
    supabase.from("hazard_susceptibility").select("zone_id, hazard_type, risk_level").limit(50000),
  ]);

  if (zonesResult.error) {
    return NextResponse.json({ error: zonesResult.error.message }, { status: 502 });
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
    const zones = zonesResult.data.map((row) => ({
      ...row,
      evacuation_route_text: { en: "", fil: "" } as Zone["evacuationRouteText"],
      evacuation_route_path: [] as Zone["evacuationRoutePath"],
      hotline_number: "",
      evacuation_centers: null,
    }));
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
