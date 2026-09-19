import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Zone } from "@/lib/types";

/**
 * Lightweight zones endpoint. Full reference data is served from
 * /data/reference-data.json (static file on Vercel CDN). This endpoint
 * exists for search/autocomplete and as a fallback.
 */
export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("zones")
    .select("id, psgc_barangay_code, name, municipality_name, province_name, lat, lng, downstream_zone_id")
    .order("id")
    .limit(50000);

  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (data.length === 0) return NextResponse.json({ error: "no zones" }, { status: 502 });

  const zones = data.map((row) => ({
    ...row,
    evacuation_route_text: { en: "", fil: "" } as Zone["evacuationRouteText"],
    evacuation_route_path: [] as Zone["evacuationRoutePath"],
    hotline_number: "",
    evacuation_centers: null,
  }));

  return NextResponse.json(zones);
}
