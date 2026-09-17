"use client";

import type { SendOutcome } from "./schedule";
import type { OutboxEntry } from "./types";

/**
 * Sends one queued entry through the server-checked route
 * (`POST /api/outbox/<operation>`) — the one way into the queue's writes,
 * shared by the page and the service worker (public/sw.js restates it). Maps the response
 * onto `SendOutcome` per the design doc's status table; never throws, since
 * a network failure is exactly the condition this whole module exists to
 * survive, and `drainOutbox` always has a next attempt to give a `retry`.
 */
export async function sendEntry(entry: OutboxEntry): Promise<SendOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/outbox/${entry.operation}`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: entry.id,
        // Sent explicitly as null, never omitted: the route distinguishes
        // "no userId key" from "userId: null" no differently (both fail the
        // `=== sub` check), but the field must always be present for an
        // unowned entry to read as intentionally unowned rather than as a
        // malformed request.
        userId: entry.userId ?? null,
        queuedAt: entry.queuedAt,
        // This device's clock now. The route trusts only sentAt - queuedAt,
        // an interval measured on one clock, and never either absolute
        // value: a phone whose clock is hours wrong still dates its writes
        // correctly on the server.
        sentAt: new Date().toISOString(),
        payload: entry.payload,
      }),
    });
  } catch {
    return { result: "retry" };
  }

  switch (response.status) {
    case 200:
      return { result: "delivered" };
    case 409:
      return { result: "held" };
    case 401:
      return { result: "signed_out" };
    case 404:
      return { result: "permanent", reason: "unknown_operation" };
    case 422: {
      const body = (await response.json().catch(() => ({}))) as { reason?: unknown };
      return { result: "permanent", reason: typeof body.reason === "string" ? body.reason : undefined };
    }
    default:
      return { result: "retry" };
  }
}
