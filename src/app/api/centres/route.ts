import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/centres
 *
 * Every evacuation centre that differs from the seed placeholder (a status,
 * a capacity or a headcount has been set), for the reference-data provider to
 * lay over the static file (see applyCentreOverlay). Small: placeholders
 * are all status 'unknown', capacity 0 and no headcount.
 * ponytail: 5,000-row cap; page it if real centres ever outnumber that.
 */
export async function GET() {
  const { data, error } = await createSupabaseServerClient()
    .from("evacuation_centers")
    .select("zone_id, name, lat, lng, capacity, status, current_occupancy")
    .or("status.neq.unknown,capacity.gt.0,current_occupancy.not.is.null")
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=30" } });
}
