import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_RESULTS = 20;

/**
 * Server-side zone search. Returns zones matching a query against name,
 * municipality_name, or province_name. Paginated, capped at MAX_RESULTS.
 *
 * GET /api/zones/search?q=Nilombot&limit=10
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10) || 20,
    MAX_RESULTS
  );

  if (!q) {
    return NextResponse.json({ results: [], total: 0 });
  }

  const supabase = createSupabaseServerClient();

  // Use full-text search with tsvector for fast matching, falling back to
  // ILIKE if the query is very short (trigram-based search would be better
  // but tsvector is already indexed).
  const { data, error } = await supabase
    .from("zones")
    .select("id, name, municipality_name, province_name, lat, lng")
    .or(
      `name.ilike.%${q}%,municipality_name.ilike.%${q}%,province_name.ilike.%${q}%`
    )
    .order("name")
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  // Get approximate total count for "showing X of Y" display
  const { count } = await supabase
    .from("zones")
    .select("id", { count: "exact", head: true })
    .or(
      `name.ilike.%${q}%,municipality_name.ilike.%${q}%,province_name.ilike.%${q}%`
    );

  return NextResponse.json({
    results: data ?? [],
    total: count ?? 0,
  });
}
