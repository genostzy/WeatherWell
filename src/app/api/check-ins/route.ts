import { NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";

/**
 * Check-ins, scoped by RLS: a resident receives only their own rows, an
 * operator receives their zone's.
 *
 * `no-store`, and it is not optional. A check-in names a person and says
 * whether they need help. RLS decides which ROWS a caller may read; it has no
 * opinion about who a cache hands the finished response to. `public/sw.js`
 * carries the matching early return, so both halves of the guarantee — the
 * network's caches and the device's — are explicit rather than assumed.
 *
 * Next 16 does not cache route handlers by default, so this header is
 * belt-and-braces against a CDN, a proxy, and a future default change.
 */
export async function GET() {
  const supabase = await createSupabaseUserClient();

  const { data, error } = await supabase
    .from("evacuation_check_ins")
    .select("id, zone_id, user_id, status, checked_in_at")
    .order("checked_in_at", { ascending: false })
    .limit(1000);

  const headers = { "Cache-Control": "no-store, no-cache, must-revalidate, private" };

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502, headers });
  }

  return NextResponse.json(
    data.map((row) => ({
      id: row.id,
      zoneId: row.zone_id,
      userId: row.user_id,
      status: row.status as "safe" | "needs_help",
      checkedInAt: row.checked_in_at,
    })),
    { headers }
  );
}
