import { NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { OfficialMarker, OfficialMarkerType } from "@/lib/official-markers";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Every official marker on the operations map. The USER client, not the
 * public one: official_markers_read is `to authenticated using
 * (private.is_operator())`, so an anonymous or resident caller gets zero
 * rows back (RLS filters silently, per the table's own migration comment) —
 * this route never claims to serve resident-facing content, unlike
 * /api/pins. `no-store` because this is an admin-only working view that
 * should never be served stale from a shared cache (and sw.js's
 * PUBLIC_API_PATHS allowlist does not include this path anyway).
 */
export async function GET() {
  const supabase = await createSupabaseUserClient();

  const { data, error } = await supabase
    .from("official_markers")
    .select("id, lat, lng, type, caption, placed_by, placed_at")
    .order("placed_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502, headers: NO_STORE });
  }

  const markers: OfficialMarker[] = (data ?? []).map((row) => ({
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    type: row.type as OfficialMarkerType,
    caption: row.caption,
    placedBy: row.placed_by,
    placedAt: row.placed_at,
  }));

  return NextResponse.json(markers, { headers: NO_STORE });
}
