"use client";

import { getBrowserClient } from "@/lib/supabase/browser";
import { safeNext } from "./safe-next";

export type SignInResult = { ok: true } | { ok: false; error: string };

/** `signedIn` is false while Supabase still wants the email confirmed ("Confirm email" on). */
export type SignUpResult = { ok: true; signedIn: boolean } | { ok: false; error: string };

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

/**
 * The Supabase Auth error codes meaning "this email already belongs to an
 * account". Only these justify signing into that account instead (M11).
 */
const EMAIL_TAKEN_CODES = new Set(["email_exists", "user_already_exists"]);

/** Sign in with email + password. */
export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const supabase = getBrowserClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Create a new account with email + password. When this phone already
 * carries an anonymous resident session, the password is ATTACHED to it
 * (same linking rule as sendEmailSignInLink) so the anonymous history —
 * every report and pin filed under this id — is kept rather than abandoned
 * under a brand-new, unrelated user.
 */
export async function signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
  const supabase = getBrowserClient();
  const { data } = await supabase.auth.getSession();

  if (data.session?.user.is_anonymous) {
    const { data: updated, error } = await supabase.auth.updateUser({ email, password });
    // The account stops being anonymous once the email is accepted.
    if (!error) return { ok: true, signedIn: updated?.user?.is_anonymous === false };
    // Same rule as sendEmailSignInLink (M11): only a taken email justifies
    // giving up on linking, and even then we cannot sign into that account
    // for them — we don't have its real password — so this is reported as a
    // failure with a pointer to sign in instead, never a silent fallback
    // that would abandon this phone's anonymous history.
    if (EMAIL_TAKEN_CODES.has(error.code ?? "")) {
      return {
        ok: false,
        error: "That email already has an account. Sign in with its password instead of creating a new one.",
      };
    }
    return { ok: false, error: error.message };
  }
  const { data: created, error } = await supabase.auth.signUp({ email, password });
  return error ? { ok: false, error: error.message } : { ok: true, signedIn: !!created?.session };
}
