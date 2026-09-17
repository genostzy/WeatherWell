import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/typhoon
 *
 * Returns the currently active typhoon track (if any).
 * Falls back to null when no active system — the admin dashboard
 * should show "No active tropical cyclone" plainly rather than inventing one.
 */
export async function GET() {
  const supabase = createSupabaseServerClient();

  // Use raw query until types are regenerated after migration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("typhoon_tracks")
    .select("id, name, international_name, category, positions, fetched_at")
    .eq("is_active", true)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    track: data ?? null,
  });
}
