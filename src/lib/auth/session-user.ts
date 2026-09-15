"use client";

import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * The user id of the session this page load last saw, or null if it has not
 * seen one. Synchronous, because `enqueue` stamps it onto a queued write and
 * `enqueue` must persist before it returns (I2).
 *
 * Per page load is the right lifetime: every identity change in this app
 * navigates — Google sign-in and the email link redirect, and sign-out is a
 * form POST — so a new identity always arrives with fresh module state.
 * Linking Google to an anonymous session is the one change that does not
 * reload with a different id, and it keeps the same user id anyway.
 */
let knownUserId: string | null = null;

export function knownSessionUserId(): string | null {
  return knownUserId;
}

export function rememberSessionUserId(userId: string | null): void {
  knownUserId = userId;
}

/**
 * The current session's user id, or null. Never signs anyone in: a reader,
 * or a device holding only someone else's queued writes, must not become a
 * permanent auth.users row.
 *
 * getSession, not getClaims: this is browser code deciding which queued
 * writes to offer the server, not code deciding what to trust. The Server
 * Action each write reaches still reads the verified claim, and RLS still
 * judges it (see useSessionUserId for the same reasoning).
 */
export async function currentSessionUserId(): Promise<string | null> {
  try {
    const { data } = await getBrowserClient().auth.getSession();
    const userId = data.session?.user?.id ?? null;
    rememberSessionUserId(userId);
    return userId;
  } catch {
    return null;
  }
}
