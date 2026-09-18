/**
 * Run this script to apply all V1 migrations to Supabase.
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY or database password
 * Usage: npx tsx scripts/apply-migrations.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.error("Add SUPABASE_SERVICE_ROLE_KEY to .env.local first.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const migrations = [
  "20260917130740_nationwide_barangays.sql",
  "20260917130800_widen_center_constraints.sql",
  "20260917140000_weather_data_tables.sql",
  "20260917150000_push_and_threshold.sql",
];

async function main() {
  for (const file of migrations) {
    const path = join(__dirname, "..", "supabase", "migrations", file);
    console.log(`\nRunning: ${file}`);
    const sql = readFileSync(path, "utf-8");

    const { error } = await supabase.rpc("exec_sql" as never, { sql } as never);

    if (error) {
      // exec_sql might not exist; try raw SQL via PostgREST
      // Fall back: just log the SQL for manual execution
      console.log(`  Error: ${error.message}`);
      console.log(`  You may need to run this SQL manually in the Supabase Dashboard SQL Editor.`);
      console.log(`  File: supabase/migrations/${file}`);
      continue;
    }

    console.log(`  ✓ Applied`);
  }

  console.log("\nDone. Verify in Supabase Dashboard → Table Editor.");
}

main().catch(console.error);
