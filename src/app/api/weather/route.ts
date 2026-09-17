import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/weather?zoneId=...
 *
 * Returns the latest weather reading for a zone, plus 12-hour history.
 * Falls back to empty arrays if no readings exist yet (data not ingested).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zoneId = searchParams.get("zoneId");

  if (!zoneId) {
    return NextResponse.json({ error: "zoneId required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // Latest reading — use raw query until types are regenerated after migration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: latest, error: latestError } = await (supabase as any)
    .from("weather_readings")
    .select("rainfall_mm, wind_kph, temperature_c, humidity_pct, weather_code, fetched_at")
    .eq("zone_id", zoneId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  if (latestError && latestError.code !== "PGRST116") {
    return NextResponse.json({ error: latestError.message }, { status: 500 });
  }

  // 12-hour history (12 hourly readings, oldest first)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: history, error: historyError } = await (supabase as any)
    .from("weather_readings")
    .select("rainfall_mm, fetched_at")
    .eq("zone_id", zoneId)
    .order("fetched_at", { ascending: false })
    .limit(12);

  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rainfallHistory = (history ?? []).reverse().map((r: any) => r.rainfall_mm);

  return NextResponse.json({
    zoneId,
    current: latest ?? null,
    rainfallHistory,
  });
}
