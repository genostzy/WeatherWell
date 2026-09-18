import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/typhoon
 *
 * Returns the currently active typhoon track (if any) with full
 * PAGASA bulletin data including wind signal levels.
 * Falls back to null when no active system.
 */
export async function GET() {
  const supabase = createSupabaseServerClient();

  // Use raw query until types are regenerated after migration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("typhoon_tracks")
    .select(
      `id, name, international_name, category, positions,
       bulletin_number, is_final, issued_at, next_bulletin_at, headline,
       max_winds_kph, gustiness_kph, pressure_hpa,
       movement_direction, movement_speed_kph,
       wind_signal, signals, source, fetched_at`
    )
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
