"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * In-flight sign-in, shared by concurrent callers. Two sign-ins on first paint
 * would create two anonymous users and orphan one of them along with anything
 * attributed to it.
 */
let inFlight: Promise<string | null> | null = null;

/**
 * The resident's user id, signing in anonymously the first time.
 *
 * Anonymous auth is what makes `auth.uid()` real, and every RLS policy in this
 * database keys off it. It replaces the random client-generated device id the
 * prototype used: this identity is issued and verified by the server, which is
 * what anti-abuse layer 5 always claimed and could not previously deliver.
 *
 * Returns null rather than throwing when there is no network. That is not a
 * failure state — the outbox queues writes without an identity and attributes
 * them at replay, because a resident with no signal still has something to say.
 */
export async function ensureAnonymousSession(): Promise<string | null> {
  const supabase = getBrowserClient();

  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.id) return data.session.user.id;

  if (!inFlight) {
    inFlight = supabase.auth
      .signInAnonymously()
      .then(({ data: signedIn, error }) => (error ? null : (signedIn.user?.id ?? null)))
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** The resident's user id once known, or null while signing in or offline. */
export function useSessionUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void ensureAnonymousSession().then((id) => {
      if (active) setUserId(id);
    });
    return () => {
      active = false;
    };
  }, []);

  return userId;
}
