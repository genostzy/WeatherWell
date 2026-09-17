"use client";

import { useEffect } from "react";
import { drainForCurrentSession } from "./session-drain";
import { currentSessionUserId } from "@/lib/auth/session-user";

/**
 * Replays queued writes when a session and a network exist. Mounted once.
 *
 * Only the current session's own writes are replayed, plus any queued before
 * this device had an identity; see drainForCurrentSession (I2). A write
 * queued before the resident had any identity gets the uid they eventually
 * receive, since there was no identity to record when they made it.
 *
 * On mount it also looks up (never creates) the current session, so a write
 * queued a moment later is stamped with who queued it. Reading the session
 * signs nobody in.
 *
 * Every queued write is sent through `POST /api/outbox/<operation>`
 * (dispatchers.ts → send.ts), where the server checks the entry belongs to
 * the signed-in user before running the Server Action. Nothing here imports
 * an action, so this file, and every component that only reads a store's
 * list, pulls in no server code.
 */
export function useOutboxDrain(): void {
  useEffect(() => {
    // Nothing queued means nothing to attribute, so drainForCurrentSession
    // signs nobody in. That guard is what keeps a visitor who only reads from
    // becoming a permanent row in auth.users.
    const run = () => drainForCurrentSession();

    void currentSessionUserId();
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, []);
}
