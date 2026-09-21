#!/usr/bin/env npx tsx
/**
 * Generates public/data/reference-data.json for client-side consumption.
 *
 * Vercel Hobby limits serverless function responses to ~4.5 MB. With 42k zones
 * + 113k hazards, the payload exceeds this limit even when compressed. Static
 * files on Vercel's CDN have no such limit.
 *
 * Usage: npx tsx scripts/generate-static-data.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchAll<T>(table: string, select: string, order?: string): Promise<T[]> {
  const PAGE = 10000;
  let offset = 0;
  const all: T[] = [];
  while (true) {
    let query = supabase.from(table).select(select).range(offset, offset + PAGE - 1);
    if (order) query = query.order(order);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    offset += PAGE;
    process.stdout.write(`  ${table}: ${all.length} rows\r`);
  }
  console.log(`  ${table}: ${all.length} rows`);
  return all;
}

interface ZoneRow {
  id: string;
  psgc_barangay_code: string;
  name: string;
  municipality_name: string;
  province_name: string;
  lat: number;
  lng: number;
  downstream_zone_id: string | null;
  hotline_number: string;
  evacuation_route_text: { en: string; fil: string };
  evacuation_route_path: [number, number][];
}
interface PoiRow { id: number; zone_id: string; category: string; name: string; lat: number; lng: number }
interface HazardRow { zone_id: string; hazard_type: string; risk_level: string }
interface EvacRow { zone_id: string; name: string; lat: number; lng: number; capacity: number; status: string; current_occupancy: number | null }

async function main() {
  mkdirSync("public/data", { recursive: true });

  const [zoneRows, poiRows, hazardRows, evacRows] = await Promise.all([
    fetchAll<ZoneRow>("zones", "id, psgc_barangay_code, name, municipality_name, province_name, lat, lng, downstream_zone_id, hotline_number, evacuation_route_text, evacuation_route_path", "id"),
    fetchAll<PoiRow>("points_of_interest", "id, zone_id, category, name, lat, lng", "id"),
    fetchAll<HazardRow>("hazard_susceptibility", "zone_id, hazard_type, risk_level"),
    fetchAll<EvacRow>("evacuation_centers", "zone_id, name, lat, lng, capacity, status, current_occupancy"),
  ]);

  const centreByZone = new Map<string, EvacRow>();
  for (const c of evacRows) centreByZone.set(c.zone_id, c);

  const zones = zoneRows.map((row) => {
    const centre = centreByZone.get(row.id) ?? null;
    return {
      id: row.id,
      psgcBarangayCode: row.psgc_barangay_code,
      name: row.name,
      municipalityName: row.municipality_name,
      provinceName: row.province_name,
      lat: row.lat,
      lng: row.lng,
      evacuationRouteText: row.evacuation_route_text,
      evacuationRoutePath: row.evacuation_route_path,
      hotlineNumber: row.hotline_number,
      ...(row.downstream_zone_id ? { downstreamZoneId: row.downstream_zone_id } : {}),
      ...(centre ? {
        evacuationCenterName: centre.name,
        evacuationCenterLat: centre.lat,
        evacuationCenterLng: centre.lng,
        centerStatus: centre.status,
        evacuationCenterCapacity: centre.capacity,
        ...(centre.current_occupancy !== null ? { currentOccupancy: centre.current_occupancy } : {}),
      } : {
        evacuationCenterName: "",
        evacuationCenterLat: row.lat,
        evacuationCenterLng: row.lng,
        centerStatus: "space_available",
        evacuationCenterCapacity: 0,
      }),
    };
  });

  const pois = poiRows.map((row) => ({
    id: row.id,
    zoneId: row.zone_id,
    category: row.category,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
  }));

  const hazards: Record<string, Partial<Record<string, string>>> = {};
  for (const row of hazardRows) {
    if (!hazards[row.zone_id]) hazards[row.zone_id] = {};
    hazards[row.zone_id][row.hazard_type] = row.risk_level;
  }

  // Guards the exact regression this script once shipped silently: the zones
  // query dropped evacuation_route_text/hotline_number and every zone wrote
  // out blank, with nothing short of reading the output catching it.
  const withRoute = zones.filter((z) => z.evacuationRouteText.en.length > 0).length;
  const withHotline = zones.filter((z) => z.hotlineNumber.length > 0).length;
  if (withRoute === 0 || withHotline === 0) {
    console.error(
      `Refusing to write reference-data.json: ${withRoute}/${zones.length} zones have route text, ${withHotline}/${zones.length} have a hotline number. Check the zones query selects evacuation_route_text and hotline_number.`
    );
    process.exit(1);
  }

  const data = { zones, pois, hazards };
  const json = JSON.stringify(data);

  writeFileSync("public/data/reference-data.json", json);

  const { statSync } = await import("fs");
  const size = statSync("public/data/reference-data.json").size;
  console.log(`\nGenerated reference-data.json:`);
  console.log(`  Zones:    ${zones.length}`);
  console.log(`  POIs:     ${pois.length}`);
  console.log(`  Hazards:  ${hazardRows.length} rows across ${Object.keys(hazards).length} zones`);
  console.log(`  Size:     ${(size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
