import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findNearestZone } from "@/lib/nearest-zone";

/**
 * ~55km. Wide enough that the true nearest zone can never sit outside it for
 * anyone within NEAR_ZONE_METERS (15km) of a covered barangay — the same
 * margin already used for "nearest evac center" on the homepage map (see
 * map-canvas.tsx's maxDeg). Cheap enough for Postgres to scan directly with
 * the (lat, lng) index this route depends on.
 */
const BOUNDING_BOX_DEG = 0.5;

interface ZoneRow {
  id: string;
  name: string;
  municipality_name: string;
  province_name: string;
  lat: number;
  lng: number;
}

/**
 * GET /api/zones/nearest?lat=..&lng=..
 *
 * Server-side replacement for onboarding's old client-side findNearestZone()
 * scan, which required every one of ~42k zones already loaded in the
 * browser. This does the same nearest-centroid search (see nearest-zone.ts's
 * own doc comment on why centroids, not boundaries) without the client ever
 * holding more than one zone's worth of data.
 */
export async function GET(request: NextRequest) {
  // Number(null) is 0, not NaN — a missing param would otherwise silently
  // resolve to Null Island instead of being rejected.
  const latParam = request.nextUrl.searchParams.get("lat");
  const lngParam = request.nextUrl.searchParams.get("lng");
  const lat = latParam === null ? NaN : Number(latParam);
  const lng = lngParam === null ? NaN : Number(lngParam);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const select = "id, name, municipality_name, province_name, lat, lng";

  const { data: boxed, error } = await supabase
    .from("zones")
    .select(select)
    .gte("lat", lat - BOUNDING_BOX_DEG)
    .lte("lat", lat + BOUNDING_BOX_DEG)
    .gte("lng", lng - BOUNDING_BOX_DEG)
    .lte("lng", lng + BOUNDING_BOX_DEG)
    .returns<ZoneRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  // Empty box: a position far enough from any covered barangay (e.g.
  // testing from outside the Philippines) that the ~55km prefilter matched
  // nothing. Fall back to an unfiltered scan so this still always finds the
  // globally nearest zone, exactly like the old client-side scan did — the
  // narrow box is a fast path, not a coverage limit.
  let data = boxed;
  if (!data || data.length === 0) {
    const fallback = await supabase.from("zones").select(select).returns<ZoneRow[]>();
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 502 });
    }
    data = fallback.data;
  }

  const match = findNearestZone({ lat, lng }, data ?? []);
  if (!match) {
    return NextResponse.json({ zone: null, distanceMeters: null, isNear: false });
  }

  return NextResponse.json({
    zone: {
      id: match.zone.id,
      name: match.zone.name,
      municipalityName: match.zone.municipality_name,
      provinceName: match.zone.province_name,
      lat: match.zone.lat,
      lng: match.zone.lng,
    },
    distanceMeters: match.distanceMeters,
    isNear: match.isNear,
  });
}
