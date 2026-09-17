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

/**
 * GET /api/route?from=lat,lng&to=lat,lng
 *
 * Returns a real road-network route from OSRM.
 * Falls back to a straight line if OSRM is unavailable.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to required (lat,lng)" }, { status: 400 });
  }

  const [fromLat, fromLng] = from.split(",").map(Number);
  const [toLat, toLng] = to.split(",").map(Number);

  if ([fromLat, fromLng, toLat, toLng].some((v) => isNaN(v))) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

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
