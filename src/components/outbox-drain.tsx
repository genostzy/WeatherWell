"use client";

import { useOutboxDrain } from "@/lib/outbox/use-outbox-drain";

/**
 * Mounts the outbox drain once per app load. A tiny wrapper rather than
 * calling the hook straight from RootLayout: RootLayout is a server
 * component, and a hook needs a client component to run in.
 */
export function OutboxDrain() {
  useOutboxDrain();
  return null;
}
