"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * One row of public.live_changes: that something changed, and where. Never
 * the change itself: a screen that cares refetches through its usual route.
 */
export interface LiveChange {
  kind: "report" | "alert" | "message";
  zone_id: string | null;
  town_code: string | null;
}

type Listener = (change: LiveChange) => void;

const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;

/** Hands a change to every screen listening. The Realtime channel's handler; tests call it directly. */
export function dispatchLiveChange(change: LiveChange): void {
  for (const listener of listeners) listener(change);
}

/**
 * One Realtime subscription for the whole page, opened while any screen
 * listens. Unit tests never open one: their client points nowhere.
 */
function openChannel(): void {
  if (channel || process.env.NODE_ENV === "test") return;
  try {
    channel = getBrowserClient()
      .channel("live-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_changes" }, (message) => {
        dispatchLiveChange(message.new as LiveChange);
      })
      .subscribe();
  } catch {
    // No connection to listen on: screens still load fresh data when opened.
    channel = null;
  }
}

function closeChannelIfUnused(): void {
  if (!channel || listeners.size > 0) return;
  void getBrowserClient().removeChannel(channel);
  channel = null;
}

/** How long a burst of changes (several reports in a minute) is gathered into one refetch. */
const GATHER_MS = 1000;

/**
 * Calls `onChange` when a change `matches`, at most once per second however
 * many arrive together, so an open dashboard refreshes by itself.
 */
export function useLiveChange(matches: (change: LiveChange) => boolean, onChange: () => void): void {
  const matchesRef = useRef(matches);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    matchesRef.current = matches;
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener: Listener = (change) => {
      if (!matchesRef.current(change) || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        onChangeRef.current();
      }, GATHER_MS);
    };
    listeners.add(listener);
    openChannel();
    return () => {
      listeners.delete(listener);
      if (timer) clearTimeout(timer);
      closeChannelIfUnused();
    };
  }, []);
}
