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

export function readSupabaseEnv(
  source: Record<string, string | undefined> = process.env
): SupabaseEnv {
  const url = requireVar(source, "NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = requireVar(source, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  // Supabase's secret keys start `sb_secret_`; legacy ones are JWTs carrying
  // "service_role". Either in a NEXT_PUBLIC_ variable would ship a key that
  // bypasses every RLS policy to every visitor's browser.
  if (publishableKey.startsWith("sb_secret_") || publishableKey.includes("service_role")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds what looks like a secret or service-role key. " +
        "NEXT_PUBLIC_ variables are compiled into the browser bundle; use the publishable key."
    );
  }

  return { url, publishableKey };
}
