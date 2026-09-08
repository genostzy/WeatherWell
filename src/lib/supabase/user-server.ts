import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "./env";
import type { Database } from "./database.types";

/**
 * A Supabase client that acts AS THE SIGNED-IN RESIDENT, for Server Actions
 * and any route that reads user-scoped rows.
 *
 * Use `createSupabaseServerClient()` from ./server instead for data that is
 * world-readable under `select using (true)` — zones, alerts, pins. Choosing
 * wrong fails in opposite directions: the public client on a user write is
 * refused loudly by RLS, while this one on a public read works but couples a
 * cacheable response to a session.
 */
export async function createSupabaseUserClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const { url, publishableKey } = readSupabaseEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, which cannot write cookies. Safe
          // to ignore: the Proxy refreshes the session on every request.
        }
      },
    },
  });
}
