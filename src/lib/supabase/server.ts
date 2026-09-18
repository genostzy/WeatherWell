import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "./env";
import type { Database } from "./database.types";

/**
 * Used only inside route handlers. `server-only` makes an accidental import
 * from a client component a build error rather than a bundle-size surprise —
 * the app has a 250 KB first-load budget and supabase-js is not in it.
 *
 * No session is persisted: every read in this plan is public data under
 * `select using (true)`, and there is no authenticated user yet.
 *
 * Typed with the generated `Database` schema so postgrest-js can infer
 * result shapes (including join cardinality, e.g. the one-to-one
 * `evacuation_centers` embed) instead of route handlers falling back to
 * a blanket `as unknown as` cast at the query boundary.
 */
export function createSupabaseServerClient(): SupabaseClient<Database> {
  const { url, publishableKey } = readSupabaseEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
    // Supabase dashboard has max_rows=1000 by default. Override so all
    // ~42k zones are returned in one request for the reference data endpoint.
    global: { headers: { "Prefer": "count=exact,max-rows=50000" } },
  });
}
