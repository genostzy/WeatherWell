import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildOpenMeteoUrl, parseOpenMeteo } from "@/lib/open-meteo";

export const dynamic = "force-dynamic";

/** Open-Meteo updates hourly; 30 minutes keeps it fresh without hammering a free service. */
const REVALIDATE_SECONDS = 1800;

/**
 * GET /api/weather?zoneId=...
 *
 * Live conditions, the last 12 hours and the next 6 hours of rain for a
 * zone's own coordinates, from Open-Meteo (free, no key). A failure is a
 * 502, never an empty "0 mm": no rain and no data are different facts.
 */
export async function GET(request: Request) {
  const zoneId = new URL(request.url).searchParams.get("zoneId");
  if (!zoneId) {
    return NextResponse.json({ error: "zoneId required" }, { status: 400 });
  }

  const { data: zone, error } = await createSupabaseServerClient()
    .from("zones")
    .select("lat, lng")
    .eq("id", zoneId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!zone) return NextResponse.json({ error: "Unknown zone" }, { status: 404 });

  const upstream = await fetch(buildOpenMeteoUrl(zone.lat, zone.lng), {
    next: { revalidate: REVALIDATE_SECONDS },
  }).catch(() => null);
  if (!upstream?.ok) {
    return NextResponse.json({ error: "Weather service unavailable" }, { status: 502 });
  }

  const parsed = parseOpenMeteo(await upstream.json(), new Date().toISOString());
  if (!parsed.current) {
    return NextResponse.json({ error: "Weather service returned no reading" }, { status: 502 });
  }

  return NextResponse.json({ zoneId, source: "open-meteo", ...parsed });
}
