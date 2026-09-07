"use client";

import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import type { LocalizedText } from "@/lib/types";
import type { ReferenceData } from "./types";

export const ReferenceDataContext = createContext<ReferenceData | null>(null);

const LOADING: LocalizedText = { en: "Loading your zone…", fil: "Kinukuha ang iyong zone…" };
const UNREACHABLE: LocalizedText = {
  en: "Can't reach WeatherWell right now. If you have opened the app before, your saved zone and evacuation instructions are still on this device — reconnect once to load them.",
  fil: "Hindi maabot ang WeatherWell ngayon. Kung nabuksan mo na ito dati, nasa device mo pa rin ang iyong zone at panuto sa paglikas — kumonekta muli para ma-load ang mga ito.",
};
const RETRY: LocalizedText = { en: "Try again", fil: "Subukang muli" };

type State =
  | { status: "loading" }
  | { status: "ready"; data: ReferenceData }
  | { status: "failed" };

/**
 * Fetches the reference data once and gates the app on it.
 *
 * Gating rather than letting each consumer handle an empty list is deliberate:
 * ~23 files read zones, and `useSelectedZone()` must return a real Zone before
 * any page can render. One place to wait means one place to get the waiting
 * right, and consumers may assume the data exists.
 *
 * On a repeat visit the service worker answers /api/zones from cache with no
 * network, so this resolves immediately and the gate is invisible.
 */
export function ReferenceDataProvider({ children }: { children: ReactNode }) {
  const { lang } = useLanguage();
  const [state, setState] = useState<State>({ status: "loading" });

  // Promise chaining rather than async/await: every setState call below runs
  // inside a `.then`/`.catch` closure, never on the synchronous call stack of
  // the effect that triggers this — which is what keeps the mount-time fetch
  // from tripping the "no setState synchronously in an effect" lint rule.
  // The "loading" state on mount comes from useState's initial value instead,
  // and a retry re-arms it explicitly (see `retry` below) before calling this.
  const load = useCallback(() => {
    fetch("/api/zones")
      .then((response) => {
        if (!response.ok) {
          // A partial or errored response must not become an empty zone list —
          // "no zones" and "no alerts" look identical to a resident.
          setState({ status: "failed" });
          return;
        }
        return response.json().then((data) => {
          setState({ status: "ready", data: data as ReferenceData });
        });
      })
      .catch(() => {
        setState({ status: "failed" });
      });
  }, []);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <p role="status" lang={lang} className="p-6 text-center text-sm text-muted-foreground">
        {t(LOADING, lang)}
      </p>
    );
  }

  if (state.status === "failed") {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p role="alert" lang={lang} className="max-w-md text-center text-sm">
          {t(UNREACHABLE, lang)}
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-md border-2 border-border px-4 py-2 text-sm font-medium"
        >
          {t(RETRY, lang)}
        </button>
      </div>
    );
  }

  return (
    <ReferenceDataContext.Provider value={state.data}>{children}</ReferenceDataContext.Provider>
  );
}
