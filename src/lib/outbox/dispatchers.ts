"use client";

import { sendEntry } from "./send";
import type { SendOutcome } from "./schedule";
import type { OutboxEntry, OutboxOperation, OutboxPayloads } from "./types";

/**
 * Narrows an entry's payload by its operation.
 *
 * Seven operations now share one queue, so every consumer that reads the outbox
 * — the stores merging their own queued writes onto server rows — must filter
 * by operation before touching a payload. Returning `undefined` rather than
 * throwing lets a store write `.map(...).filter(Boolean)` over a mixed queue,
 * which is what all three of them want.
 */
export function payloadOf<K extends OutboxOperation>(
  entry: OutboxEntry,
  operation: K
): OutboxPayloads[K] | undefined {
  return entry.operation === operation ? (entry.payload as OutboxPayloads[K]) : undefined;
}

/**
 * Sends one queued entry through the server-checked route
 * (`POST /api/outbox/<operation>`) — the one way into the queue's writes,
 * for the page and (Task 5) the service worker alike. There is no longer a
 * per-operation branch here: every operation shares this one wire, and an
 * operation with no runner behind it is refused by the route itself (404 →
 * `{ result: "permanent", reason: "unknown_operation" }`, see
 * `send.ts`/`sendEntry` and the route's own tests), not by a client-side
 * dispatch table that a new operation could add a union case to and forget.
 */
export function dispatchQueued(entry: OutboxEntry): Promise<SendOutcome> {
  return sendEntry(entry);
}
