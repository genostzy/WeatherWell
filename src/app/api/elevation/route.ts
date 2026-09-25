import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildElevationUrl, parseElevation } from "@/lib/elevation";

export const dynamic = "force-dynamic";

/** ~100 m: Open-Meteo's terrain data is 90 m cells, so more precision tells it nothing and gives away more. */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * POST /api/elevation with { zoneId, lat, lng }
 *
 * The height of where the resident stands and of their barangay centre, from
 * Open-Meteo (free, no key). Proxied because the page may only talk to this
 * site; the position is rounded, passed through and never stored. A POST
 * body, never a query string, which request logs and browser history keep.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { zoneId?: unknown; lat?: unknown; lng?: unknown } | null;
  const zoneId = typeof body?.zoneId === "string" ? body.zoneId : null;
  const lat = typeof body?.lat === "number" ? body.lat : NaN;
  const lng = typeof body?.lng === "number" ? body.lng : NaN;
  if (!zoneId || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "zoneId, lat and lng required" }, { status: 400 });
  }

  const { data: zone, error } = await createSupabaseServerClient()
    .from("zones")
    .select("lat, lng")
    .eq("id", zoneId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!zone) return NextResponse.json({ error: "Unknown zone" }, { status: 404 });

  const upstream = await fetch(
    buildElevationUrl([{ lat: round3(lat), lng: round3(lng) }, { lat: zone.lat, lng: zone.lng }]),
    { cache: "no-store" }
  ).catch(() => null);
  const values = upstream?.ok ? parseElevation(await upstream.json(), 2) : null;
  if (!values) return NextResponse.json({ error: "Elevation service unavailable" }, { status: 502 });

  return NextResponse.json({ here: values[0], centre: values[1] });
}
