import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";

/**
 * Nationwide barangay seed generator.
 *
 * Parses:
 * 1. barangays.geojson — 42k barangay polygons with PSGC codes and boundaries
 * 2. PSGC-2Q-2026-Publication-Datafile.xlsx — 42k barangays with population, urban/rural
 *
 * Merges on PSGC code, computes centroids from polygons, and generates SQL
 * for zones, evacuation centres, hazard susceptibility, and municipalities.
 *
 * Run: npx tsx scripts/generate-nationwide-seed.ts
 *
 * Output: supabase/migrations/<timestamp>_nationwide_barangays.sql
 */

interface BarangayGeoJson {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: {
      ADM4_EN: string;
      ADM4_PCODE: string;
      ADM3_EN: string;
      ADM3_PCODE: string;
      ADM2_EN: string;
      ADM2_PCODE: string;
      ADM1_EN: string;
      ADM1_PCODE: string;
      psgc_id: string;
      psgc_code: string;
      psgc_name: string;
      psgc_status: string;
      AREA_SQKM: number;
    };
    geometry:
      | { type: "Polygon"; coordinates: number[][][] }
      | { type: "MultiPolygon"; coordinates: number[][][][] };
  }[];
}

interface PsgcBarangay {
  code: string;
  name: string;
  municipality: string;
  province: string;
  population: number;
  urbanRural: string;
}

/** Postgres string literal. */
function q(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** JSONB literal. */
function jsonb(value: unknown): string {
  return `${q(JSON.stringify(value))}::jsonb`;
}

/**
 * Compute the centroid of a set of coordinates (lng/lat pairs).
 * For MultiPolygon, uses the largest polygon by vertex count.
 */
function centroid(
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] }
): { lat: number; lng: number } {
  let coords: number[][];

  if (geometry.type === "MultiPolygon") {
    // Use the polygon with the most vertices
    const largest = geometry.coordinates.reduce(
      (best, poly) => (poly[0].length > best[0].length ? poly : best),
      geometry.coordinates[0]
    );
    coords = largest[0];
  } else {
    coords = geometry.coordinates[0];
  }

  const lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
  const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
  return { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000 };
}

/**
 * Parse the PSGC Excel file. Returns a map of 10-digit code → barangay data.
 * Skips rows without valid 10-digit codes.
 */
function parsePsgcExcel(path: string): Map<string, PsgcBarangay> {
  // Dynamic import for xlsx (may not be installed in production)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  const wb = XLSX.readFile(path);
  const ws = wb.Sheets["PSGC"];
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
  });

  const map = new Map<string, PsgcBarangay>();
  for (const row of rows.slice(1)) {
    if (row[3] !== "Bgy") continue;
    const code = String(row[0]);
    if (code.length !== 10) continue;

    map.set(code, {
      code,
      name: String(row[1]),
      municipality: "", // Derived from the GeoJSON hierarchy
      province: "",
      population: typeof row[8] === "number" ? row[8] : 0,
      urbanRural: String(row[7] || ""),
    });
  }
  return map;
}

/**
 * Parse barangays.geojson and merge with PSGC Excel data.
 * Returns merged barangays ready for SQL generation.
 */
function mergeData(
  geoPath: string,
  psgcPath: string
): {
  zones: {
    id: string;
    psgcCode: string;
    name: string;
    lat: number;
    lng: number;
    municipality: string;
    province: string;
    population: number;
    urbanRural: string;
  }[];
  municipalities: Map<string, { code: string; name: string }>;
  stats: { total: number; withCoords: number; withPopulation: number };
} {
  const geoData: BarangayGeoJson = JSON.parse(readFileSync(geoPath, "utf8"));
  const psgcMap = parsePsgcExcel(psgcPath);

  const municipalities = new Map<string, { code: string; name: string }>();
  const zones: {
    id: string;
    psgcCode: string;
    name: string;
    lat: number;
    lng: number;
    municipality: string;
    province: string;
    population: number;
    urbanRural: string;
  }[] = [];

  let withCoords = 0;
  let withPopulation = 0;

  // Deduplicate by PSGC code (some features share codes)
  const seen = new Set<string>();

  for (const feature of geoData.features) {
    const psgcCode = feature.properties.psgc_code;
    if (!psgcCode || psgcCode.length !== 10) continue;
    if (seen.has(psgcCode)) continue;
    seen.add(psgcCode);

    const { lat, lng } = centroid(feature.geometry);
    const municipality = feature.properties.ADM3_EN;
    const province = feature.properties.ADM2_EN;

    // Track municipalities
    const muniCode = psgcCode.slice(0, 7);
    if (!municipalities.has(muniCode)) {
      municipalities.set(muniCode, { code: muniCode, name: municipality });
    }

    // Look up population from PSGC Excel
    const psgcData = psgcMap.get(psgcCode);
    const population = psgcData?.population ?? 0;
    const urbanRural = psgcData?.urbanRural ?? "";

    zones.push({
      id: `zone-${psgcCode}`,
      psgcCode,
      name: `Barangay ${feature.properties.psgc_name}, ${municipality}`,
      lat,
      lng,
      municipality,
      province,
      population,
      urbanRural,
    });

    withCoords++;
    if (population > 0) withPopulation++;
  }

  return {
    zones,
    municipalities,
    stats: {
      total: zones.length,
      withCoords,
      withPopulation,
    },
  };
}

/**
 * Generate the SQL migration file.
 */
function generateSql(
  zones: {
    id: string;
    psgcCode: string;
    name: string;
    lat: number;
    lng: number;
    municipality: string;
    province: string;
    population: number;
    urbanRural: string;
  }[],
  municipalities: Map<string, { code: string; name: string }>
): string {
  const lines: string[] = [
    "-- Nationwide barangay seed — generated by scripts/generate-nationwide-seed.ts",
    "--",
    "-- Sources:",
    "--   - barangay-boundaries-repository (NAMRIA shapefiles + PSA PSGC, MIT license)",
    "--   - PSA PSGC 2Q 2026 Publication Datafile",
    "--",
    "-- Coverage: ~42,000 Philippine barangays with real centroids from boundary polygons.",
    "-- Evacuation centres are placeholders (status='unknown') — to be filled by operators.",
    "-- Hazard susceptibility is 'unknown' — real DENR-MGB data arrives in Stage 3.",
    "",
    "begin;",
    "",
  ];

  // --- Zones ---
  lines.push("-- Zones: one per barangay with real coordinates from boundary centroids");
  lines.push("insert into public.zones (id, psgc_barangay_code, name, evacuation_route_text,");
  lines.push("  lat, lng, evacuation_route_path, hotline_number) values");

  const zoneValues = zones.map((z) => {
    // Placeholder evacuation route: "Contact your barangay captain for evacuation instructions."
    const routeText = jsonb({
      en: "Contact your barangay captain for evacuation instructions.",
      fil: "Makipag-ugnayan sa inyong barangay captain para sa mga tagubilin sa paglikas.",
    });
    // Placeholder route path: a single point (the zone itself) — real routing arrives in V1
    const routePath = jsonb([[z.lat, z.lng]]);
    // Placeholder hotline
    const hotline = "00000000000";

    return `  (${q(z.id)}, ${q(z.psgcCode)}, ${q(z.name)}, ${routeText}, ${z.lat}, ${z.lng}, ${routePath}, ${q(hotline)})`;
  });

  lines.push(zoneValues.join(",\n"));
  lines.push("on conflict (id) do update set name = excluded.name,");
  lines.push("  psgc_barangay_code = excluded.psgc_barangay_code,");
  lines.push("  lat = excluded.lat, lng = excluded.lng;");
  lines.push("");

  // --- Evacuation centres ---
  lines.push("-- Evacuation centres: one per zone, placeholder status — to be filled by operators");
  lines.push("insert into public.evacuation_centers (id, zone_id, name, lat, lng, capacity, status) values");

  const centerValues = zones.map((z) => {
    // Placeholder center at the same location as the zone
    const name = `Evacuation Centre — ${z.name.split(", ")[1] || z.name}`;
    return `  (${q(`center-${z.id}`)}, ${q(z.id)}, ${q(name)}, ${z.lat}, ${z.lng}, 0, 'unknown')`;
  });

  lines.push(centerValues.join(",\n"));
  lines.push("on conflict (id) do update set name = excluded.name,");
  lines.push("  lat = excluded.lat, lng = excluded.lng;");
  lines.push("");

  // --- Hazard susceptibility ---
  lines.push("-- Hazard susceptibility: all 'unknown' — real DENR-MGB data arrives in Stage 3");
  lines.push("insert into public.hazard_susceptibility (id, zone_id, hazard_type, risk_level) values");

  const hazardTypes = ["flood", "landslide", "storm_surge"] as const;
  const hazardValues: string[] = [];
  for (const z of zones) {
    for (const hazardType of hazardTypes) {
      hazardValues.push(`  (${q(`${z.id}-${hazardType}`)}, ${q(z.id)}, ${q(hazardType)}, 'unknown')`);
    }
  }

  lines.push(hazardValues.join(",\n"));
  lines.push("on conflict (id) do update set risk_level = excluded.risk_level;");
  lines.push("");

  // --- Municipalities ---
  lines.push("-- Municipalities: deduplicated from the barangay hierarchy");
  lines.push("insert into public.municipalities (code, name) values");

  const muniValues = [...municipalities.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((m) => `  (${q(m.code)}, ${q(m.name)})`);

  lines.push(muniValues.join(",\n"));
  lines.push("on conflict (code) do nothing;");
  lines.push("");

  lines.push("commit;");
  lines.push("");

  return lines.join("\n");
}

// --- Main ---
const GEO_PATH = process.argv[2] || "C:\\Users\\Wilson\\Downloads\\barangays.geojson";
const PSGC_PATH =
  process.argv[3] || "C:\\Users\\Wilson\\Downloads\\PSGC-2Q-2026-Publication-Datafile.xlsx";

console.log("Parsing GeoJSON...");
const { zones, municipalities, stats } = mergeData(GEO_PATH, PSGC_PATH);

console.log(`Merged: ${stats.total} barangays, ${stats.withCoords} with coordinates, ${stats.withPopulation} with population`);
console.log(`Municipalities: ${municipalities.size}`);

console.log("Generating SQL...");
const sql = generateSql(zones, municipalities);

const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const outPath = `supabase/migrations/${timestamp}_nationwide_barangays.sql`;
writeFileSync(outPath, sql);
console.log(`Written to ${outPath}`);
console.log(`SQL length: ${sql.length} bytes, ${sql.split("\n").length} lines`);
