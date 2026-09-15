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
 * dispatchQueued lives in dispatchers.ts and dynamically imports the real
 * Server Action for whichever operation an entry carries (which pulls in
 * user-server.ts's `import "server-only"`) precisely so this file, and every
 * component that only reads a store's list, never pays that cost just from
 * being loaded.
 */
export function useOutboxDrain(): void {
  useEffect(() => {
    // Nothing queued means nothing to attribute, so drainForCurrentSession
    // signs nobody in. That guard is what keeps a visitor who only reads from
    // becoming a permanent row in auth.users — see Task 2 Step 6.
    const run = () => drainForCurrentSession();

    void currentSessionUserId();
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, []);
}
