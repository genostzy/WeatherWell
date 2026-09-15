"use client";

import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { AlertsContext, AlertsRefreshContext } from "@/lib/alerts-store";
import type { AlertRecord, LocalizedText } from "@/lib/types";
import type { ReferenceData } from "./types";

export const ReferenceDataContext = createContext<ReferenceData | null>(null);

const LOADING: LocalizedText = { en: "Loading your zone…", fil: "Kinukuha ang iyong zone…" };
const UNREACHABLE: LocalizedText = {
  en: "Can't reach WeatherWell right now. If you have opened the app before, your saved zone and evacuation instructions are still on this device — reconnect once to load them.",
  fil: "Hindi maabot ang WeatherWell ngayon. Kung nabuksan mo na ito dati, nasa device mo pa rin ang iyong zone at panuto sa paglikas — kumonekta muli para ma-load ang mga ito.",
};
const RETRY: LocalizedText = { en: "Try again", fil: "Subukang muli" };

/**
 * How long each fetch waits before this hook gives up and reaches "failed".
 *
 * This is independent of the service worker's own timeouts (see sw.js's
 * NETWORK_TIMEOUT_MS / ALERTS_TIMEOUT_MS) and matters even when the worker is
 * healthy: on a first visit the worker may not control the page yet (it is
 * still downloading/installing), so nothing intercepts this fetch at all — a
 * stalled-but-open connection (a captive portal, a congested cell site) would
 * otherwise leave the gate in "loading" forever with no retry button. 10s is
 * comfortably past ALERTS_TIMEOUT_MS so a worker-mediated request that is
 * about to resolve from cache is not raced and cut off first.
 */
export const FETCH_TIMEOUT_MS = 10_000;

function fetchWithTimeout(input: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

type State =
  | { status: "loading" }
  | { status: "ready"; data: ReferenceData; alerts: AlertRecord[] }
  | { status: "failed" };

/**
 * Fetches the reference data once and gates the app on it.
 *
 * Gating rather than letting each consumer handle an empty list is deliberate:
 * ~23 files read zones, and `useSelectedZone()` must return a real Zone before
 * any page can render. One place to wait means one place to get the waiting
 * right, and consumers may assume the data exists.
 *
 * Alerts load alongside zones in the same gate: both must succeed before the
 * app renders, because a page showing every zone with no alert data reads as
 * "every barangay is safe" — the single most dangerous wrong answer this
 * system can give.
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
    Promise.all([
      fetchWithTimeout("/api/zones", FETCH_TIMEOUT_MS),
      fetchWithTimeout("/api/alerts", FETCH_TIMEOUT_MS),
    ])
      .then(([zonesResponse, alertsResponse]) => {
        if (!zonesResponse.ok || !alertsResponse.ok) {
          // A partial or errored response must not become an empty zone list —
          // "no zones" and "no alerts" look identical to a resident.
          setState({ status: "failed" });
          return;
        }
        return Promise.all([zonesResponse.json(), alertsResponse.json()]).then(([data, alerts]) => {
          setState({
            status: "ready",
            data: data as ReferenceData,
            alerts: alerts as AlertRecord[],
          });
        });
      })
      .catch(() => {
        setState({ status: "failed" });
      });
  }, []);

  /**
   * Re-reads alerts only, after an official's alert write is confirmed (C1).
   * Zones are left alone: their route is stale-while-revalidate in the
   * service worker, so refetching them would hand back the cached copy anyway.
   *
   * A failed refresh keeps the alerts already on screen rather than dropping
   * to the "can't reach WeatherWell" card: the app was working a moment ago,
   * and replacing every screen with an error because one follow-up read
   * failed would take the dashboard away mid-flood. Never throws, so a caller
   * awaiting it cannot turn a confirmed write into a reported failure.
   */
  const refreshAlerts = useCallback(
    () =>
      fetchWithTimeout("/api/alerts", FETCH_TIMEOUT_MS)
        .then((response) => (response.ok ? (response.json() as Promise<AlertRecord[]>) : null))
        .then((alerts) => {
          if (!alerts) return;
          setState((current) => (current.status === "ready" ? { ...current, alerts } : current));
        })
        .catch(() => undefined),
    []
  );

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
    <ReferenceDataContext.Provider value={state.data}>
      <AlertsContext.Provider value={state.alerts}>
        <AlertsRefreshContext.Provider value={refreshAlerts}>{children}</AlertsRefreshContext.Provider>
      </AlertsContext.Provider>
    </ReferenceDataContext.Provider>
  );
}
