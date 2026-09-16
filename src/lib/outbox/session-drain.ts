"use client";

import { flushOutbox } from "./drain";
import { claimUnattributed, readOutbox, unholdOwnEntries } from "./outbox";
import { dispatchQueued } from "./dispatchers";
import { ensureAnonymousSession } from "@/lib/auth/anonymous-session";
import { currentSessionUserId, rememberSessionUserId } from "@/lib/auth/session-user";

/**
 * Sends the queued writes that belong to the current session, and only those
 * (I2). Every drain in the app goes through here: the mount/online listener
 * and each store's send-now after a write.
 *
 * Which entries go:
 * - `userId` equal to the current session's id: this person queued it.
 * - `userId: null`: queued on this device before any identity existed. It is
 *   claimed for the session that exists (or, for a first write, is created)
 *   now, which is the original first-write rule: there was no one else to
 *   attribute it to.
 *
 * Which stay held (never sent, never deleted, never marked failed):
 * - another user's id. Person A's writes must not replay as person B, which
 *   would make the action record name B for A's moderation.
 * - no `userId` field at all: queued by a build older than this rule, so
 *   nothing says whose it is. Holding is the only choice that cannot
 *   misattribute; the live database had no users when this shipped, so no
 *   real resident's write is stranded by it.
 *
 * Signing in happens only when an unattributed entry is waiting, never just
 * to send an entry that already names someone. After a sign-out the departing
 * user's entries name them, so the drain finds no reason to create a stranger
 * identity and replay them under it.
 */
export function drainForCurrentSession(): void {
  const pending = readOutbox().filter((entry) => entry.status !== "stuck");
  // Nothing queued means nothing to attribute, so do not even look.
  if (pending.length === 0) return;

  // ensureAnonymousSession is started synchronously when it is needed, as the
  // drain always has, so a first write begins its sign-in on the same tick.
  // It returns the existing session's id without signing in when one exists.
  const needsIdentity = pending.some((entry) => entry.userId === null);
  const identity = needsIdentity ? ensureAnonymousSession() : currentSessionUserId();

  void identity.then((userId) => {
    if (!userId) return;
    rememberSessionUserId(userId);
    claimUnattributed(userId);
    // A drain running as this user's own session is exactly the moment a
    // 409 stops meaning anything: held entries owned by userId go back to
    // pending so this drain (and the ones after it) sends them again,
    // rather than waiting forever for a "held" state that already resolved
    // the instant this session became userId's own (design doc, "Held
    // entries").
    unholdOwnEntries(userId);
    // flushOutbox, not drainOutbox: a drain declined because another is in
    // flight would otherwise leave this caller's write unsent.
    void flushOutbox(dispatchQueued, (entry) => entry.userId === userId);
  });
}
