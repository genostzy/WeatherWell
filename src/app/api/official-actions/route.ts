import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { toOfficialActions } from "@/lib/official-actions-mapper";

const HEADERS = { "Cache-Control": "no-store, private" };

/**
 * Officials' read of the action record. RLS returns every entry to an
 * official and nothing to anyone else, so a resident who calls this gets [].
 * Never cached: it names officials. sw.js already sends /api paths that are
 * not on its public allowlist to the network uncached.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200);

  const supabase = await createSupabaseUserClient();
  let query = supabase
    .from("official_actions")
    .select("id, occurred_at, actor_name, actor_area, action, zone_id, target_id, detail")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  const zone = params.get("zone");
  if (zone) query = query.eq("zone_id", zone);
  if (params.get("kind") === "alert") query = query.in("action", ["alert.set", "alert.cleared"]);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 502, headers: HEADERS });

  // `detail` is a `jsonb not null default '{}'` column, which postgrest-js
  // renders as the broader `Json` type (it can't see the CHECK/default). This
  // narrows exactly that one field to the object shape the column always
  // holds at runtime — same per-field pattern as /api/alerts, never a
  // whole-result cast.
  const rows = data.map((row) => ({ ...row, detail: row.detail as Record<string, unknown> }));
  return NextResponse.json(toOfficialActions(rows), { headers: HEADERS });
}
