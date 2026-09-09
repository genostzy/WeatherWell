"use client";

import { useEffect } from "react";
import { flushOutbox } from "./drain";
import { readOutbox } from "./outbox";
import { ensureAnonymousSession } from "@/lib/auth/anonymous-session";
import { dispatchQueued } from "./dispatchers";

/**
 * Replays queued writes when a session and a network exist. Mounted once.
 *
 * Attribution happens here, not at queue time: a report (or pin, vote, or
 * check-in) made before the resident had any identity gets the uid they
 * eventually receive. That is honest — the write genuinely is from that
 * device — and it is the only option, since there was no identity to record
 * when they made it.
 *
 * dispatchQueued lives in dispatchers.ts and dynamically imports the real
 * Server Action for whichever operation an entry carries (which pulls in
 * user-server.ts's `import "server-only"`) precisely so this file, and every
 * component that only reads a store's list, never pays that cost just from
 * being loaded.
 */
export function useOutboxDrain(): void {
  useEffect(() => {
    const run = () => {
      // Nothing queued means nothing to attribute, so do not sign anyone in.
      // This guard is what keeps a visitor who only reads from becoming a
      // permanent row in auth.users — see Task 2 Step 6.
      if (readOutbox().length === 0) return;

      void ensureAnonymousSession().then((userId) => {
        // flushOutbox, not drainOutbox: an "online" event that arrives while
        // a drain is already in flight would otherwise be declined and
        // silently dropped, which is the one moment this listener exists for.
        if (userId) void flushOutbox(dispatchQueued);
      });
    };

    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, []);
}
