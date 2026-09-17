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
/** Where this device remembers whose session it last had (display only). */
export const LAST_SESSION_USER_KEY = "weatherwell.lastSessionUserId";

function readRemembered(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(LAST_SESSION_USER_KEY);
  } catch {
    return null;
  }
}

function remember(userId: string | null): void {
  try {
    if (userId) window.localStorage.setItem(LAST_SESSION_USER_KEY, userId);
    else window.localStorage.removeItem(LAST_SESSION_USER_KEY);
  } catch {
    // Storage blocked: the hook still works for this page load.
  }
}

export function useSessionUserId(): string | null {
  // Start from the id this device last had, so a fresh page does not briefly
  // hide the resident's own queued writes while the session lookup runs.
  const [userId, setUserId] = useState<string | null>(readRemembered);

  useEffect(() => {
    let active = true;
    const supabase = getBrowserClient();

    // An hour offline expires the access token, and supabase-js then answers
    // "no session" with a retryable error it could not refresh past. That is
    // not a sign-out: clearing the id would hide the resident's own unsent
    // reports and invite a duplicate. Keep the last known id unless the
    // session is genuinely absent while online with no error.
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      const id = data.session?.user.id ?? null;
      if (id) {
        remember(id);
        setUserId(id);
        return;
      }
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      if (error || offline) return;
      remember(null);
      setUserId(null);
    });

    // The read above answers for the session that exists at mount. Sign-in
    // happens on the first WRITE, which is after that — so without this a
    // resident who drops their first pin keeps `null` for the rest of the
    // session. Subscribing signs nobody in; it only listens. Only an explicit
    // SIGNED_OUT clears the id; any other session-less event is a refresh
    // hiccup, not a change of person.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const id = session?.user.id ?? null;
      if (id) {
        remember(id);
        setUserId(id);
      } else if (event === "SIGNED_OUT") {
        remember(null);
        setUserId(null);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return userId;
}
