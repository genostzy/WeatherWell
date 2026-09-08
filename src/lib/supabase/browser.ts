"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "./env";
import type { Database } from "./database.types";

let client: SupabaseClient<Database> | null = null;

/**
 * The browser's Supabase client. Sessions live in cookies rather than
 * localStorage, which is what lets a Server Action read the same session and
 * act as this resident — a token the server cannot see is a token that cannot
 * satisfy an RLS policy.
 *
 * Memoised: a second client means a second auth listener racing the first to
 * refresh the same token.
 */
export function getBrowserClient(): SupabaseClient<Database> {
  if (!client) {
    const { url, publishableKey } = readSupabaseEnv({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    client = createBrowserClient<Database>(url, publishableKey);
  }
  return client;
}
