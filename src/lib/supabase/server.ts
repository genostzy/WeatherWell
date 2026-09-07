import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "./env";

/**
 * Used only inside route handlers. `server-only` makes an accidental import
 * from a client component a build error rather than a bundle-size surprise —
 * the app has a 250 KB first-load budget and supabase-js is not in it.
 *
 * No session is persisted: every read in this plan is public data under
 * `select using (true)`, and there is no authenticated user yet.
 */
export function createSupabaseServerClient(): SupabaseClient {
  const { url, publishableKey } = readSupabaseEnv();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
