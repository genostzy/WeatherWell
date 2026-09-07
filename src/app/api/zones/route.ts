import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toReferenceData } from "@/lib/reference-data/types";

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

  const failure = zonesResult.error ?? poisResult.error ?? hazardsResult.error;
  if (failure) {
    // Never 200 with partial reference data: a zone list missing entries reads
    // as "that barangay is fine" to whoever is looking at it.
    return NextResponse.json({ error: failure.message }, { status: 502 });
  }

  try {
    // The client returned from createSupabaseServerClient() has no Database
    // generic (Task 1 keeps it that way — see that file), so postgrest-js
    // can't know evacuation_centers is a one-to-one embed and infers `.data`
    // as a loosely-typed array-shaped guess rather than ZoneRow[]. The select
    // strings above are what actually pin the shape; this cast just tells
    // the compiler what the query already guarantees at runtime.
    const data = toReferenceData(
      zonesResult.data as unknown as Parameters<typeof toReferenceData>[0],
      poisResult.data as unknown as Parameters<typeof toReferenceData>[1],
      hazardsResult.data as unknown as Parameters<typeof toReferenceData>[2]
    );
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
