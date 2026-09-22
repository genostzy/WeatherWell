"use client";

import { getBrowserClient } from "@/lib/supabase/browser";
import { safeNext } from "./safe-next";

export type SignInResult = { ok: true } | { ok: false; error: string };

function returnUrl(route: "/auth/callback" | "/auth/confirm", next: string): string {
  const url = new URL(route, window.location.origin);
  url.searchParams.set("next", safeNext(next));
  return url.toString();
}

/**
 * Google sign-in. When this phone already carries an anonymous resident
 * session, the Google identity is LINKED to it (manual linking must be on in
 * Supabase), so the user id — and every report and pin filed under it — is
 * kept. `link: false` is the fallback the sign-in page offers when linking
 * failed because that Google account already belongs to another user.
 */
export async function startGoogleSignIn(next: string, opts: { link?: boolean } = {}): Promise<SignInResult> {
  const supabase = getBrowserClient();
  const redirectTo = returnUrl("/auth/callback", next);
  const { data } = await supabase.auth.getSession();

  if ((opts.link ?? true) && data.session?.user.is_anonymous) {
    const { error } = await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo } });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  return error ? { ok: false, error: error.message } : { ok: true };
}
