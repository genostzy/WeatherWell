import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * OSRM routing configuration.
 * V1 uses the public demo server. Production should self-host OSRM
 * on Render with the Philippine road network for reliability.
 */
const OSRM_BASE_URL = process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org";

interface OSRMRoute {
  geometry: {
    coordinates: [number, number][];
    type: string;
  };
  distance: number; // meters
  duration: number; // seconds
}

interface OSRMResponse {
  code: string;
  routes: OSRMRoute[];
}

/** A [lat, lng] pair of numbers, or null. */
function point(value: unknown): [number, number] | null {
  return Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === "number" && Number.isFinite(v))
    ? [value[0], value[1]]
    : null;
}

/**
 * POST /api/route with { from: [lat, lng], to: [lat, lng] }
 *
 * Returns a real road-network route from OSRM.
 * Falls back to a straight line if OSRM is unavailable. A POST body, never a
 * query string: `from` is where the resident stands, and request logs and
 * browser history keep an address.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { from?: unknown; to?: unknown } | null;
  const from = point(body?.from);
  const to = point(body?.to);

  if (!from || !to) {
    return NextResponse.json({ error: "from and to required as [lat, lng]" }, { status: 400 });
  }

  const [fromLat, fromLng] = from;
  const [toLat, toLng] = to;

  try {
    // OSRM uses lng,lat order (GeoJSON convention)
    const osrmUrl = `${OSRM_BASE_URL}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=false`;

    const res = await fetch(osrmUrl, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`OSRM returned ${res.status}`);
    }

    const data: OSRMResponse = await res.json();

    if (data.code !== "Ok" || !data.routes.length) {
      throw new Error("No route found");
    }

    const route = data.routes[0];

    // Convert OSRM [lng, lat] to our [lat, lng] format
    const polyline: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]) => [lat, lng]
    );

    return NextResponse.json({
      polyline,
      distanceMeters: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
    });
  } catch {
    // Fallback: straight line between points
    const polyline: [number, number][] = [
      [fromLat, fromLng],
      [toLat, toLng],
    ];

    return NextResponse.json({
      polyline,
      distanceMeters: null,
      durationSeconds: null,
      fallback: true,
    });
  }
}
