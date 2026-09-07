/**
 * The two variables the app needs to reach Supabase. Both are NEXT_PUBLIC_,
 * meaning Next compiles them into the browser bundle — which is correct for
 * the publishable key (it is designed to be public and is gated by RLS) and
 * is why the secret-key guard below exists.
 */
export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

function requireVar(source: Record<string, string | undefined>, name: string): string {
  const value = source[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill both values ` +
        `from the Supabase dashboard (Project Settings -> API Keys).`
    );
  }
  return value.trim();
}

/**
 * Decodes the middle segment of a legacy Supabase key, which is a JWT, and
 * reports whether its `role` claim is `service_role`. Returns false for
 * anything that isn't a well-formed three-segment JWT with a JSON payload —
 * the guard only rejects keys it can positively identify as service-role; it
 * must never throw on (or reject) a key of unknown shape.
 */
function isServiceRoleJwt(key: string): boolean {
  const segments = key.split(".");
  if (segments.length !== 3) {
    return false;
  }

  try {
    // Base64url -> base64: swap the two substituted characters and restore
    // padding, which base64url omits.
    const base64 = segments[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(segments[1].length / 4) * 4, "=");
    const payload: unknown = JSON.parse(atob(base64));
    return (
      typeof payload === "object" &&
      payload !== null &&
      (payload as { role?: unknown }).role === "service_role"
    );
  } catch {
    return false;
  }
}

export function readSupabaseEnv(
  source: Record<string, string | undefined> = process.env
): SupabaseEnv {
  const url = requireVar(source, "NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = requireVar(source, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  // Supabase's secret keys start `sb_secret_`; legacy ones are JWTs whose
  // decoded payload carries `role: "service_role"`. Either in a NEXT_PUBLIC_
  // variable would ship a key that bypasses every RLS policy to every
  // visitor's browser.
  if (publishableKey.startsWith("sb_secret_") || isServiceRoleJwt(publishableKey)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds what looks like a secret or service-role key. " +
        "NEXT_PUBLIC_ variables are compiled into the browser bundle; use the publishable key."
    );
  }

  return { url, publishableKey };
}
