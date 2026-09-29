import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import type { RouteOption, RouteResponse } from "@/lib/route-types";

export const dynamic = "force-dynamic";

/**
 * The free walking router FOSSGIS runs for OpenStreetMap: no key, no account.
 * Its usage policy asks for a User-Agent that names the app. A self-hosted
 * router later goes in OSRM_BASE_URL.
 */
const ROUTER_BASE_URL = process.env.OSRM_BASE_URL ?? "https://routing.openstreetmap.de/routed-foot";
const USER_AGENT = "WeatherWell (flood evacuation app)";
/** Alternatives asked for besides the router's first choice: the screen prefers the first one that avoids alerts and blocked roads. */
const ALTERNATIVES = 3;
const TIMEOUT_MS = 8_000;

/**
 * FOSSGIS allows one request a second at most, from the whole app. Ten in any
 * ten seconds keeps to that and still lets a few residents search at once.
 */
const ROUTER_BUDGET = { max: 10, windowSeconds: 10 };
/**
 * One address can't spend that budget alone. A search asks about up to 3
 * places, so 20 a minute is several searches, with room for the many phones a
 * mobile carrier puts behind one address.
 */
const PER_CALLER = { max: 20, windowSeconds: 60 };

// Counted first in this instance's memory, which stops a flood before it
// reaches the database, then exactly, in the database (sharedCountAllows).
const routerBudget = createRateLimiter(ROUTER_BUDGET.max, ROUTER_BUDGET.windowSeconds * 1000);
const perCaller = createRateLimiter(PER_CALLER.max, PER_CALLER.windowSeconds * 1000);

const tooMany = () => NextResponse.json({ error: "Too many requests" }, { status: 429 });

/**
 * The exact count, which every server instance shares (public.take_rate_limit):
 * the caller first, so a refused caller spends none of the router's budget. The
 * address is kept only as a keyed hash. If the database cannot answer, the walk
 * goes ahead: a resident's route matters more than the count.
 */
async function sharedCountAllows(ip: string): Promise<boolean> {
  try {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret);
    const take = async (key: string, { max, windowSeconds }: { max: number; windowSeconds: number }) => {
      // A failed call leaves data null, which lets the walk go ahead too.
      const { data } = await supabase.rpc("take_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
      return data !== false;
    };
    const caller = `route:caller:${createHmac("sha256", secret).update(ip).digest("base64url").slice(0, 22)}`;
    return (await take(caller, PER_CALLER)) && (await take("route:router", ROUTER_BUDGET));
  } catch {
    return true;
  }
}

/** A [lat, lng] pair of numbers, or null. */
function point(value: unknown): [number, number] | null {
  return Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === "number" && Number.isFinite(v))
    ? [value[0], value[1]]
    : null;
}

/** One route from the router's answer, in [lat, lng] order, or null when it carries no usable line. */
function optionOf(route: unknown): RouteOption | null {
  const { geometry, distance, duration } = (route ?? {}) as {
    geometry?: { coordinates?: unknown };
    distance?: unknown;
    duration?: unknown;
  };
  const coordinates = geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const polyline: [number, number][] = [];
  for (const pair of coordinates) {
    // The router writes [lng, lat], the GeoJSON order.
    const lngLat = point(pair);
    if (!lngLat) return null;
    polyline.push([lngLat[1], lngLat[0]]);
  }
  return {
    polyline,
    distanceMeters: typeof distance === "number" ? Math.round(distance) : null,
    durationSeconds: typeof duration === "number" ? Math.round(duration) : null,
  };
}

/**
 * POST /api/route with { from: [lat, lng], to: [lat, lng] }
 *
 * Answers { routes, fallback }: every walking route the router offers, the
 * router's first choice first. If the router is down, slow or has no route, one
 * straight line between the points, marked `fallback: true`. A POST body, never
 * a query string: `from` is where the resident stands, and request logs and
 * browser history keep an address. Past either limit above it answers 429
 * without asking the router, and the screen draws the same marked straight line.
 */
export async function POST(request: Request) {
  if (!perCaller(clientIp(request))) return tooMany();

  const body = (await request.json().catch(() => null)) as { from?: unknown; to?: unknown } | null;
  const from = point(body?.from);
  const to = point(body?.to);

  if (!from || !to) {
    return NextResponse.json({ error: "from and to required as [lat, lng]" }, { status: 400 });
  }

  if (!routerBudget("router")) return tooMany();
  if (!(await sharedCountAllows(clientIp(request)))) return tooMany();

  const [fromLat, fromLng] = from;
  const [toLat, toLng] = to;

  try {
    // The router takes lng,lat order (the GeoJSON convention).
    const url = `${ROUTER_BASE_URL}/route/v1/foot/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&alternatives=${ALTERNATIVES}`;

    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`router returned ${res.status}`);
    }

    const data = (await res.json()) as { code?: unknown; routes?: unknown };
    const routes = Array.isArray(data.routes)
      ? data.routes.map(optionOf).filter((route): route is RouteOption => route !== null)
      : [];

    if (data.code !== "Ok" || routes.length === 0) {
      throw new Error("No route found");
    }

    return NextResponse.json({ routes, fallback: false } satisfies RouteResponse);
  } catch {
    // Fallback: straight line between points
    const straight: RouteOption = { polyline: [from, to], distanceMeters: null, durationSeconds: null };
    return NextResponse.json({ routes: [straight], fallback: true } satisfies RouteResponse);
  }
}
