import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildOverpassQuery, parseOverpass } from "@/lib/osm-candidates";

export const dynamic = "force-dynamic";

/** Public Overpass instances, tried in order: the main one is often too busy to answer. */
const MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const USER_AGENT = "WeatherWell/1.0 (+https://weatherwell.vercel.app)";

/**
 * GET /api/evacuation-candidates?zoneId=...
 *
 * Likely evacuation sites near a barangay from OpenStreetMap (idea 10).
 * Best-effort by design: every failure is an empty list, because "no
 * suggestions" is a fine answer and an error box is not.
 */
export async function GET(request: Request) {
  const zoneId = new URL(request.url).searchParams.get("zoneId");
  if (!zoneId) return NextResponse.json({ error: "zoneId required" }, { status: 400 });

  const { data: zone, error } = await createSupabaseServerClient()
    .from("zones")
    .select("lat, lng")
    .eq("id", zoneId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!zone) return NextResponse.json({ error: "Unknown zone" }, { status: 404 });

  const query = encodeURIComponent(buildOverpassQuery(zone.lat, zone.lng));
  for (const mirror of MIRRORS) {
    const res = await fetch(`${mirror}?data=${query}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
      // Not the fetch cache: Overpass reports a timeout as HTTP 200 with a
      // "remark", and caching that would mean a week of empty answers. Only
      // a real answer gets cached, by the CDN, via the header below.
      cache: "no-store",
    }).catch(() => null);
    if (!res?.ok) continue;
    const reply = await res.json().catch(() => null);
    if (reply && !(reply as { remark?: unknown }).remark) {
      return NextResponse.json(parseOverpass(reply, zone.lat, zone.lng), {
        // Schools and halls don't move; a day at the edge keeps load on a free, volunteer-run service low.
        headers: { "Cache-Control": "public, s-maxage=86400" },
      });
    }
  }
  return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
}
