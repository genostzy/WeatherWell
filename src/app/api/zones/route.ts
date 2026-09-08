import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toReferenceData } from "@/lib/reference-data/types";
import type { HazardRiskLevel, HazardType, PointOfInterest, Zone } from "@/lib/types";

/**
 * All reference data in one response. Route handlers are not cached by default
 * in this version of Next, which is what we want: the service worker owns
 * caching for this URL (stale-while-revalidate into an unversioned cache, so a
 * device that updates and then loses signal keeps its evacuation instructions).
 */
export async function GET() {
  const supabase = createSupabaseServerClient();

  const [zonesResult, poisResult, hazardsResult] = await Promise.all([
    supabase
      .from("zones")
      .select(
        "id, psgc_barangay_code, name, evacuation_route_text, lat, lng, evacuation_route_path, hotline_number, downstream_zone_id, evacuation_centers(name, lat, lng, capacity, status)"
      )
      .order("id"),
    supabase.from("points_of_interest").select("id, zone_id, category, name, lat, lng").order("id"),
    supabase.from("hazard_susceptibility").select("zone_id, hazard_type, risk_level"),
  ]);

  // Checked and returned individually (rather than combined into one
  // `a ?? b ?? c` failure value) so TypeScript's discriminated-union
  // narrowing on each PostgrestResponse actually applies below: after all
  // three checks, `.data` on each result is known non-null without a `!`.
  // Never 200 with partial reference data: a zone list missing entries
  // reads as "that barangay is fine" to whoever is looking at it.
  if (zonesResult.error) {
    return NextResponse.json({ error: zonesResult.error.message }, { status: 502 });
  }
  if (poisResult.error) {
    return NextResponse.json({ error: poisResult.error.message }, { status: 502 });
  }
  if (hazardsResult.error) {
    return NextResponse.json({ error: hazardsResult.error.message }, { status: 502 });
  }
  // RLS and grant regressions don't error, they return zero rows — a 200 with
  // an empty zone list opens the gate in provider.tsx and then crashes every
  // page that calls useSelectedZone(). Empty pois/hazards stay legitimate (a
  // barangay may genuinely have neither), so only zones is checked here.
  if (zonesResult.data.length === 0) {
    return NextResponse.json({ error: "zones query returned no rows" }, { status: 502 });
  }

  try {
    // The client is typed with the generated `Database` schema (see
    // server.ts), so postgrest-js infers the rest of each row correctly,
    // including evacuation_centers as a one-to-one embed. What's left below
    // are `text` columns with CHECK constraints rather than Postgres enums
    // (`evacuation_route_text`/`evacuation_route_path` are `jsonb`, `status`,
    // `category`, `hazard_type` and `risk_level` are `text`), so the
    // generated types render them as `Json`/`string`. Each assertion below
    // narrows exactly one such field to the literal union the CHECK
    // constraint already guarantees at runtime — no whole-result cast.
    const zones = zonesResult.data.map((row) => ({
      ...row,
      evacuation_route_text: row.evacuation_route_text as Zone["evacuationRouteText"],
      evacuation_route_path: row.evacuation_route_path as Zone["evacuationRoutePath"],
      evacuation_centers: row.evacuation_centers
        ? { ...row.evacuation_centers, status: row.evacuation_centers.status as Zone["centerStatus"] }
        : null,
    }));
    const pois = poisResult.data.map((row) => ({
      ...row,
      category: row.category as PointOfInterest["category"],
    }));
    const hazards = hazardsResult.data.map((row) => ({
      ...row,
      hazard_type: row.hazard_type as HazardType,
      risk_level: row.risk_level as HazardRiskLevel,
    }));

    const data = toReferenceData(zones, pois, hazards);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
