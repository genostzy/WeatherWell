/**
 * Weather data ingestion script.
 *
 * Fetches current weather for all zones from wttr.in and stores in Supabase.
 * Designed to run as a Vercel Cron Job (every 6 hours).
 *
 * Usage: npx tsx scripts/fetch-weather.ts
 * Or: Vercel Cron Job → /api/cron/weather
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface WttrCondition {
  temp_C: string;
  precipMM: string;
  humidity: string;
  windspeedKmph: string;
  weatherCode: string;
  feelsLikeC: string;
  uvIndex: string;
}

interface WttrResponse {
  current_condition?: WttrCondition[];
}

/**
 * Fetch weather from wttr.in for a single coordinate.
 * Returns null on failure (network error, rate limit, etc).
 */
async function fetchWeatherForCoords(
  lat: number,
  lng: number
): Promise<WttrCondition | null> {
  try {
    const url = `https://wttr.in/${lat},${lng}?format=j1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "WeatherWell/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data: WttrResponse = await res.json();
    return data.current_condition?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Batch zones by proximity to reduce API calls.
 * wttr.in accepts coordinates; nearby zones get the same reading.
 * Group zones within ~5km (0.05°) and fetch once per group.
 */
function groupZonesByProximity(
  zones: { id: string; lat: number; lng: number }[],
  precision = 0.05
): { representative: typeof zones[0]; members: typeof zones }[] {
  const sorted = [...zones].sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  const groups: { representative: typeof zones[0]; members: typeof zones }[] = [];
  let current: typeof zones = [];
  let groupLat = Infinity;

  for (const zone of sorted) {
    if (current.length === 0 || Math.abs(zone.lat - groupLat) > precision) {
      if (current.length > 0) {
        groups.push({ representative: current[0], members: current });
      }
      current = [zone];
      groupLat = zone.lat;
    } else {
      current.push(zone);
    }
  }
  if (current.length > 0) {
    groups.push({ representative: current[0], members: current });
  }
  return groups;
}

async function main() {
  console.log("Starting weather ingestion...");

  // Fetch all zones with coordinates
  const { data: zones, error: fetchError } = await supabase
    .from("zones")
    .select("id, lat, lng")
    .not("lat", "is", null)
    .not("lng", "is", null);

  if (fetchError || !zones) {
    console.error("Failed to fetch zones:", fetchError?.message);
    process.exit(1);
  }

  console.log(`Found ${zones.length} zones with coordinates`);

  const zonesWithCoords = zones
    .filter((z): z is { id: string; lat: number; lng: number } =>
      z.lat !== null && z.lng !== null
    );

  const groups = groupZonesByProximity(zonesWithCoords);
  console.log(`Grouped into ${groups.length} proximity clusters`);

  let fetched = 0;
  let failed = 0;

  for (const group of groups) {
    const weather = await fetchWeatherForCoords(
      group.representative.lat,
      group.representative.lng
    );

    if (!weather) {
      failed += group.members.length;
      continue;
    }

    // Insert the same reading for all zones in this group
    const readings = group.members.map((zone) => ({
      zone_id: zone.id,
      rainfall_mm: parseFloat(weather.precipMM) || 0,
      wind_kph: parseFloat(weather.windspeedKmph) || 0,
      temperature_c: parseFloat(weather.temp_C) || 0,
      humidity_pct: parseFloat(weather.humidity) || 0,
      weather_code: parseInt(weather.weatherCode) || 0,
      fetched_at: new Date().toISOString(),
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from("weather_readings")
      .insert(readings);

    if (insertError) {
      console.error(`Insert error for group:`, insertError.message);
      failed += group.members.length;
    } else {
      fetched += group.members.length;
    }

    // Rate limit: 1 request per second to wttr.in
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`Done. Fetched: ${fetched}, Failed: ${failed}`);

  // Clean up old readings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: cleanupError } = await (supabase as any).rpc("cleanup_old_weather_readings");
  if (cleanupError) {
    console.warn("Cleanup failed:", cleanupError.message);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
