import { NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { toOfficialMessage } from "@/lib/official-messages";

const HEADERS = { "Cache-Control": "no-store, private" };

/**
 * The updates of the caller's town, newest first. RLS returns a town's
 * updates to the officials appointed in it (and an admin) and nothing to
 * anyone else. Never cached: sw.js sends /api paths off its public
 * allowlist to the network uncached.
 */
export async function GET() {
  const supabase = await createSupabaseUserClient();
  const { data, error } = await supabase
    .from("official_messages")
    .select("id, town_code, zone_id, direction, kind, body, sender_name, created_at, acknowledged_at, acknowledged_by_name")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 502, headers: HEADERS });
  return NextResponse.json(data.map(toOfficialMessage), { headers: HEADERS });
}
