"use client";

import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { AlertsContext, AlertsRefreshContext } from "@/lib/alerts-store";
import { useHasOnboarded } from "@/features/onboarding/onboarding-storage";
import type { AlertRecord, CenterStatus, LocalizedText } from "@/lib/types";
import { expandReferenceData, type ReferenceData } from "./types";

export const ReferenceDataContext = createContext<ReferenceData | null>(null);

/**
 * Applies a confirmed centre-status write to the matching zone in
 * ReferenceDataContext's own state, so every screen reading useZones() sees
 * it (R1). Supplied by ReferenceDataProvider beside the zones themselves, the
 * same way AlertsRefreshContext sits beside AlertsContext — a screen that
 * patched its own copy would leave every other screen showing the old status.
 *
 * Deliberately a local patch rather than a refetch (unlike
 * AlertsRefreshContext/refreshAlerts above): reference data is served
 * stale-while-revalidate by the service worker (see public/sw.js), so
 * refetching it after the write would hand back the cached, pre-write copy.
 * Patching locally is safe here because `status` is exactly the value the
 * database just accepted — evacuation_centers.status is not derived from
 * anything else server-side — so the client can be sure of the new state
 * without waiting on a round trip the cache would swallow anyway.
 */
export const SetCenterStatusContext = createContext<((zoneId: string, status: CenterStatus) => void) | null>(null);

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
 * otherwise leave the gate in "loading" forever with no retry button.
 *
 * 30s, not 10s: /data/reference-data.json is the nationwide barangay seed
 * (~0.7MB gzipped once compacted, H1) — on the "degraded network" this app's own PRD names as the
 * design constraint, that legitimately takes longer than 10s to arrive while
 * still being a connection that is working, not stalled. The old 10s bound
 * turned a slow-but-successful load into a hard "can't reach WeatherWell"
 * failure. This is a stopgap: it stops misclassifying slow as unreachable,
 * but does not reduce what has to transfer before the app is usable — that
 * needs the homepage to stop requiring the whole country's zones up front,
 * which this constant alone cannot fix. Comfortably past ALERTS_TIMEOUT_MS
 * either way, so a worker-mediated request that is about to resolve from
 * cache is not raced and cut off first.
 */
export const FETCH_TIMEOUT_MS = 30_000;

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
 * `/` and `/onboarding` bypass the gate entirely for a not-yet-onboarded
 * visitor (see `bypassGate` below) — not every route, just these two.
 * OnboardingGate is what redirects a first-time visitor from `/` to
 * `/onboarding`, and OnboardingGate is itself a child of this provider:
 * without the `/` bypass, even *reaching* that redirect would wait on the
 * full nationwide fetch first. Nothing on either route before onboarding
 * completes reads useZones()/useSelectedZone()/AlertsContext; ZonePicker
 * resolves a zone through /api/zones/search and /api/zones/nearest instead.
 * Blocking either would make the very first thing a new resident does the
 * single worst-case load in the app, on the exact degraded connection this
 * data is meant to survive. Every other route keeps gating exactly as
 * before, deep link or not.
 *
 * On a repeat visit the service worker answers reference data from cache with no
 * network, so this resolves immediately and the gate is invisible.
 */
export function ReferenceDataProvider({
  children,
  chrome,
  gatedExtras,
}: {
  children: ReactNode;
  /**
   * Rendered unconditionally, wrapped in the same `ReferenceDataContext` as
   * `children` but never gated behind it — for header content (Task 6's
   * `OutboxBadge`) that must stay visible while data is loading or the fetch
   * has failed, the same as `LanguageToggle` and `AccountLink` beside it
   * always have been. A `chrome` consumer reading the context directly
   * (rather than through `useZones()`, which still throws on `null`) sees
   * `null` until `state.status === "ready"`, exactly when `children` itself
   * would not exist yet either.
   */
  chrome?: ReactNode;
  /**
   * The opposite of the bypass `children` gets on `/` and `/onboarding`:
   * always waits for `state.status === "ready"`, on every route, no
   * exceptions. For global widgets the root layout mounts alongside
   * `children` — SelectedZoneHotlineButton, TilePrecacher — that call
   * useZones()/useSelectedZone() themselves and genuinely need real data
   * regardless of what page is showing. If these were plain `children`,
   * bypassing the gate for the onboarding page would also bypass it for
   * them, and they would throw ("no ReferenceDataProvider ancestor")
   * instead of just waiting quietly like they always have.
   */
  gatedExtras?: ReactNode;
}) {
  const { lang } = useLanguage();
  const pathname = usePathname();
  // useHasOnboarded, not a plain hasOnboarded() call: this is read during
  // render (not an effect), and a plain call would return false on the
  // server (no window) but the real value on the client's first paint —
  // a hydration mismatch for any returning, already-onboarded resident.
  // null ("not yet known", server and first client paint alike) never
  // bypasses; only a confirmed `false` does, one render after hydration.
  const onboarded = useHasOnboarded();
  // Deliberately scoped to exactly the routes that matter, not "every
  // route while not onboarded": a stale deep link into e.g. /evacuation
  // before onboarding must keep its current behavior (render with whatever
  // default zone it already falls back to), not start throwing "no
  // ReferenceDataProvider ancestor" because this bypassed the gate there too.
  // /a is unconditional (not gated on onboarded status): SharedAlertView
  // reads nothing from ReferenceDataContext, and the whole point of the
  // route is rendering a forwarded alert from its URL fragment alone, for a
  // recipient who may never have opened this app before — gating it behind
  // a nationwide reference-data fetch defeats that.
  const bypassGate =
    (pathname?.startsWith("/onboarding") ?? false) ||
    (pathname === "/" && onboarded === false) ||
    pathname === "/a";
  const [state, setState] = useState<State>({ status: "loading" });

  // Promise chaining rather than async/await: every setState call below runs
  // inside a `.then`/`.catch` closure, never on the synchronous call stack of
  // the effect that triggers this — which is what keeps the mount-time fetch
  // from tripping the "no setState synchronously in an effect" lint rule.
  // The "loading" state on mount comes from useState's initial value instead,
  // and a retry re-arms it explicitly (see `retry` below) before calling this.
  const load = useCallback(() => {
    Promise.all([
      fetchWithTimeout("/data/reference-data.json", FETCH_TIMEOUT_MS),
      fetchWithTimeout("/api/alerts", FETCH_TIMEOUT_MS),
    ])
      .then(([zonesResponse, alertsResponse]) => {
        if (!zonesResponse.ok || !alertsResponse.ok) {
          // A partial or errored response must not become an empty zone list —
          // "no zones" and "no alerts" look identical to a resident.
          setState({ status: "failed" });
          return;
        }
        return Promise.all([zonesResponse.json(), alertsResponse.json()]).then(([raw, alerts]) => {
          // The real static file is compacted (see CompactReferenceData), or in
          // the previous interned format if a service worker cached it; test
          // fixtures across this codebase hand-write plain zone objects, and
          // must keep working exactly as before.
          const data =
            raw && typeof raw === "object" && ("format" in raw || "evacuationRouteTextTable" in raw)
              ? expandReferenceData(raw as Parameters<typeof expandReferenceData>[0])
              : (raw as ReferenceData);
          setState({
            status: "ready",
            data,
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

  /**
   * Patches one zone's centerStatus in place once a setCenterStatus write is
   * confirmed (R1). No fetch involved — see the comment on
   * SetCenterStatusContext above for why a refetch would not work here.
   */
  const applyCenterStatus = useCallback((zoneId: string, status: CenterStatus) => {
    setState((current) => {
      if (current.status !== "ready") return current;
      return {
        ...current,
        data: {
          ...current.data,
          zones: current.data.zones.map((zone) =>
            zone.id === zoneId ? { ...zone, centerStatus: status } : zone
          ),
        },
      };
    });
  }, []);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ReferenceDataContext.Provider value={state.status === "ready" ? state.data : null}>
      {chrome}
      {bypassGate && (
        // The fetch above still runs in the background (so it's likely
        // already cached by the time onboarding finishes and lands on the
        // real gate), but nothing here waits on it.
        children
      )}
      {!bypassGate && state.status === "loading" && (
        <p role="status" lang={lang} className="p-6 text-center text-sm text-muted-foreground">
          {t(LOADING, lang)}
        </p>
      )}
      {!bypassGate && state.status === "failed" && (
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
      )}
      {state.status === "ready" && (
        // gatedExtras always renders here once ready, bypass or not.
        // children only renders here when NOT bypassed — the bypass branch
        // above already rendered it, and rendering it twice would mount two
        // copies of the real onboarding page once its data happens to load.
        <SetCenterStatusContext.Provider value={applyCenterStatus}>
          <AlertsContext.Provider value={state.alerts}>
            <AlertsRefreshContext.Provider value={refreshAlerts}>
              {!bypassGate && children}
              {gatedExtras}
            </AlertsRefreshContext.Provider>
          </AlertsContext.Provider>
        </SetCenterStatusContext.Provider>
      )}
    </ReferenceDataContext.Provider>
  );
}
