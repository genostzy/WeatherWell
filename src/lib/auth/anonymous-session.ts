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

/**
 * The resident's user id if they already have a session, or null.
 *
 * Deliberately does NOT call ensureAnonymousSession: this hook is mounted by
 * components that only read (the map, the moderation panel), and signing in
 * to answer "who am I" would make every visitor a permanent auth.users row
 * against a free-tier allowance. A resident who has never written has no id,
 * and `isOwnPin` correctly reports that none of the pins are theirs — because
 * none of them are.
 *
 * `getSession()` is acceptable HERE AND ONLY HERE. The rule it looks like it
 * breaks — never trust getSession, only getClaims verifies the JWT signature —
 * is a rule about SERVER code deciding what to trust. This is browser code
 * deciding which buttons to show. A resident who tampered with their own
 * cookie could make an Edit button appear on a neighbour's pin; the edit
 * itself still goes to a Server Action that reads the verified claim, and to
 * an RLS policy that reads auth.uid(). Authorisation never moves here.
 */
export function useSessionUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = getBrowserClient();

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null);
    });

    // The read above answers for the session that exists at mount. Sign-in
    // happens on the first WRITE, which is after that — so without this a
    // resident who drops their first pin keeps `null` for the rest of the
    // session, and the moment their optimistic pin is replaced by its real
    // server row, Edit and Delete vanish from their own pin until they
    // reload. Subscribing signs nobody in; it only listens.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user.id ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return userId;
}
