import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabaseEnv } from "./env";
import type { Database } from "./database.types";

/**
 * Refreshes the auth token on every request and hands the new one to both the
 * server and the browser. Without this, a resident's session expires mid-storm
 * and their queued reports stop being attributable.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = readSupabaseEnv();

  // Created per request on purpose — never hoisted to a module global, which
  // under Fluid compute would share one resident's client with another.
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Cache-Control / Expires / Pragma. Without these a CDN can cache a
        // response carrying one resident's session and serve it to another.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Nothing may run between createServerClient and getClaims(). getClaims
  // verifies the JWT signature against the project's published keys;
  // getSession() does not revalidate and must never be trusted server-side.
  await supabase.auth.getClaims();

  return response;
}
