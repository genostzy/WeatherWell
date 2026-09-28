import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DetailsOverlayRow } from "@/lib/reference-data/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/barangay-details
 *
 * The barangays whose hotlines and evacuation instructions an official has
 * filled in (set_barangay_details), for the reference-data provider to lay
 * over the static file (applyDetailsOverlay). Public, like the zones table it
 * reads. The service worker keeps a copy, so a phone still has its barangay's
 * hotline offline.
 */
/** PostgREST answers at most this many rows a request. */
const PAGE = 1000;

export async function GET() {
  const supabase = createSupabaseServerClient();
  const rows: DetailsOverlayRow[] = [];
  // Page until a short page: a single read stops at 1,000 barangays, and the
  // rest would show residents the placeholders again.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("zones")
      .select("id, hotline_number, extra_hotlines, evacuation_route_text")
      .not("details_set_at", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    rows.push(...((data ?? []) as DetailsOverlayRow[]));
    if (!data || data.length < PAGE) break;
  }
  return NextResponse.json(rows, { headers: { "Cache-Control": "public, s-maxage=30" } });
}
