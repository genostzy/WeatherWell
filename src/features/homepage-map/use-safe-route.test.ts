import { createElement, type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSafeRoute } from "./use-safe-route";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { AlertsContext } from "@/lib/alerts-store";
import { MOCK_ALERTS } from "@/lib/mock-data";
import type { CandidateSite } from "@/lib/osm-candidates";
import type { CommunityPin } from "@/lib/community-pins";
import type { RouteResponse } from "@/lib/route-types";
import type { AlertRecord, Zone } from "@/lib/types";

// useCommunityPins asks who the resident is; in a test that must not reach Supabase.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: async () => null,
  useSessionUserId: () => null,
}));

const [zone1, zone2, zone3, zone4] = FIXTURE_REFERENCE_DATA.zones;
const zones = FIXTURE_REFERENCE_DATA.zones;
/** Standing near zone 1's point. */
const HERE = { lat: 16.029, lng: 120.436 };

/** MOCK_ALERTS has zone 1 under Warning, zones 2 and 3 under Evacuate, zone 4 under a yellow Advisory. */
function withZoneAlert(zoneId: string, changes: Partial<AlertRecord>): AlertRecord[] {
  return MOCK_ALERTS.map((a) => (a.zoneId === zoneId ? { ...a, ...changes } : a));
}

type Position = { lat: number; lng: number } | null;
type Props = { livePosition: Position };

/** Zone 4 without a confirmed centre (its name is the seed's blank): the search then falls to OpenStreetMap. */
const zonesWithoutCentre4: Zone[] = zones.map((z) => (z.id === zone4.id ? { ...z, evacuationCenterName: "" } : z));

function renderSafeRoute(alerts: AlertRecord[] = MOCK_ALERTS, livePosition: Position = null, onScreen: Zone[] = zones) {
  return renderHook(({ livePosition }: Props) => useSafeRoute({ zones: onScreen, livePosition, startZone: zone1 }), {
    initialProps: { livePosition } as Props,
    wrapper: ({ children }: { children: ReactNode }) => createElement(AlertsContext.Provider, { value: alerts }, children),
  });
}

interface Call {
  url: string;
  body?: { from: [number, number]; to: [number, number] };
}

/**
 * The network as the hook sees it: /api/route answers with one walk between
 * the two points (or whatever `route` says), the likely-sites endpoint with
 * `sites`, and everything else (/api/pins, on mount) with an empty list.
 */
function stubNetwork(
  options: {
    route?: (call: Call) => Promise<RouteResponse> | RouteResponse;
    sites?: CandidateSite[] | Error;
    /** What /api/pins answers on the map's own mount fetch, which the service worker may serve from an old copy. */
    pins?: CommunityPin[];
    /** What it answers a request with a query string, which the service worker sends to the network first. */
    pinsNow?: CommunityPin[] | Error;
  } = {}
) {
  const calls: Call[] = [];
  const walk = ({ body }: Call): RouteResponse => ({
    routes: [{ polyline: [body!.from, body!.to], distanceMeters: 1200, durationSeconds: 900 }],
    fallback: false,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      const call: Call = { url, body: init?.body ? JSON.parse(String(init.body)) : undefined };
      calls.push(call);
      if (url === "/api/route") return { ok: true, json: async () => (options.route ?? walk)(call) };
      if (url.startsWith("/api/evacuation-candidates")) {
        if (options.sites instanceof Error) throw options.sites;
        return { ok: true, json: async () => options.sites ?? [] };
      }
      if (url.startsWith("/api/pins")) {
        const asked = url.includes("?");
        if (asked && options.pinsNow instanceof Error) throw options.pinsNow;
        return { ok: true, json: async () => (asked && options.pinsNow ? options.pinsNow : options.pins) ?? [] };
      }
      return { ok: true, json: async () => [] };
    })
  );
  return { calls, routeCalls: () => calls.filter((c) => c.url === "/api/route") };
}

const setOnline = (online: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, value: online });

beforeEach(() => {
  localStorage.clear();
  setOnline(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setOnline(true);
});

describe("useSafeRoute", () => {
  it("fetches nothing until asked", async () => {
    const { calls } = stubNetwork();
    const { result } = renderSafeRoute(MOCK_ALERTS, HERE);
    // Let the map's own mount fetches (the pins) go by.
    await act(async () => {});

    expect(calls.filter((c) => c.url === "/api/route" || c.url.startsWith("/api/evacuation-candidates"))).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.searching).toBe(false);
  });

  it("starts from the barangay, and says so, without a position", async () => {
    const { routeCalls } = stubNetwork();
    const { result } = renderSafeRoute(MOCK_ALERTS, null);

    act(() => result.current.findCentre());
    await waitFor(() => expect(result.current.result).not.toBeNull());

    // Only zone 4 is neither under Warning or Evacuate nor far; the walk starts at zone 1's own point.
    expect(routeCalls()[0].body).toEqual({ from: [zone1.lat, zone1.lng], to: [zone4.evacuationCenterLat, zone4.evacuationCenterLng] });
    expect(result.current.fromBarangay).toBe(true);
    expect(result.current.result?.destination).toMatchObject({ kind: "centre", name: zone4.evacuationCenterName });
  });

  it("starts from where the resident is when the phone knows", async () => {
    const { routeCalls } = stubNetwork();
    const { result } = renderSafeRoute(MOCK_ALERTS, HERE);

    act(() => result.current.findCentre());
    await waitFor(() => expect(result.current.result).not.toBeNull());

    expect(routeCalls()[0].body?.from).toEqual([HERE.lat, HERE.lng]);
    expect(result.current.fromBarangay).toBe(false);
  });

  it("keeps only the latest search's result when asked twice", async () => {
    // The first walk (to zone 4's centre) is answered after the second (to zone 3's).
    let releaseFirst: () => void = () => {};
    let asked = 0;
    stubNetwork({
      route: (call) => {
        const response: RouteResponse = {
          routes: [{ polyline: [call.body!.from, call.body!.to], distanceMeters: 1200, durationSeconds: 900 }],
          fallback: false,
        };
        return ++asked === 1 ? new Promise<RouteResponse>((resolve) => (releaseFirst = () => resolve(response))) : response;
      },
    });
    const { result } = renderSafeRoute(withZoneAlert("zone-2", { isActive: false }), HERE);

    act(() => result.current.findCentre());
    act(() => result.current.routeToZone(zone3.id));
    await waitFor(() => expect(result.current.result?.destination?.name).toBe(zone3.evacuationCenterName));

    await act(async () => releaseFirst());

    expect(result.current.result?.destination?.name).toBe(zone3.evacuationCenterName);
    expect(result.current.searching).toBe(false);
  });

  it("offline, gives the nearest centre in a straight line and routes nothing", async () => {
    const { calls } = stubNetwork();
    setOnline(false);
    const { result } = renderSafeRoute(MOCK_ALERTS, HERE);

    act(() => result.current.findCentre());

    expect(result.current.offline).toBe(true);
    expect(result.current.result).toMatchObject({
      status: "found",
      fallback: true,
      destination: { kind: "centre", name: zone4.evacuationCenterName },
      route: { polyline: [[HERE.lat, HERE.lng], [zone4.evacuationCenterLat, zone4.evacuationCenterLng]] },
    });
    expect(calls.filter((c) => c.url === "/api/route" || c.url.startsWith("/api/evacuation-candidates"))).toEqual([]);
  });

  it("routes to the barangay whose marker was tapped, without searching for another", async () => {
    const { calls, routeCalls } = stubNetwork();
    const { result } = renderSafeRoute(MOCK_ALERTS, HERE);

    act(() => result.current.routeToZone(zone2.id));
    await waitFor(() => expect(result.current.result).not.toBeNull());

    expect(routeCalls()).toHaveLength(1);
    expect(routeCalls()[0].body?.to).toEqual([zone2.evacuationCenterLat, zone2.evacuationCenterLng]);
    expect(calls.some((c) => c.url.startsWith("/api/evacuation-candidates"))).toBe(false);
    // Zone 2 is under Evacuate, and the walk ends in it: said, not hidden.
    expect(result.current.result?.problems).toMatchObject([{ kind: "zone", zone: { id: zone2.id } }]);
  });

  it("asks OpenStreetMap for likely sites, by barangay and not by position, only when no confirmed centre is in reach, and passes over those inside a barangay under alert", async () => {
    // The hall is in zone 1, under Warning; the school is by zone 4, which has no confirmed centre but no alert either.
    const hall: CandidateSite = { name: "Nilombot Barangay Hall", kind: "hall", lat: 16.03, lng: 120.437, distanceM: 150 };
    const school: CandidateSite = { name: "Santa Barbara Elementary School", kind: "school", lat: zone4.lat + 0.0005, lng: zone4.lng, distanceM: 55 };
    const { calls } = stubNetwork({ sites: [hall, school] });
    const { result } = renderSafeRoute(MOCK_ALERTS, HERE, zonesWithoutCentre4);

    act(() => result.current.findCentre());
    await waitFor(() => expect(result.current.result).not.toBeNull());

    const asked = calls.find((c) => c.url.startsWith("/api/evacuation-candidates"))!;
    expect(asked.url).toBe(`/api/evacuation-candidates?zoneId=${zone1.id}`);
    expect(result.current.result?.destination).toMatchObject({ kind: "likely", name: "Santa Barbara Elementary School" });
  });

  it("waits for the likely-site search as long as the server may take, about 33 seconds, not 15", async () => {
    // Overpass and then Nominatim both slow: the server answers after 30 seconds, as fetch does unless it was aborted.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const school: CandidateSite = { name: "Santa Barbara Elementary School", kind: "school", lat: zone4.lat + 0.0005, lng: zone4.lng, distanceM: 55 };
      vi.stubGlobal(
        "fetch",
        vi.fn((input: string, init?: RequestInit) => {
          const url = String(input);
          if (url.startsWith("/api/evacuation-candidates")) {
            return new Promise((resolve, reject) => {
              const timer = setTimeout(() => resolve({ ok: true, json: async () => [school] }), 30_000);
              init?.signal?.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(new DOMException("aborted", "AbortError"));
              });
            });
          }
          if (url === "/api/route") {
            const body = JSON.parse(String(init?.body));
            return Promise.resolve({ ok: true, json: async () => ({ routes: [{ polyline: [body.from, body.to], distanceMeters: 1, durationSeconds: 1 }], fallback: false }) });
          }
          return Promise.resolve({ ok: true, json: async () => [] });
        })
      );
      const { result } = renderSafeRoute(MOCK_ALERTS, HERE, zonesWithoutCentre4);

      act(() => result.current.findCentre());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });

      expect(result.current.result?.destination).toMatchObject({ kind: "likely", name: "Santa Barbara Elementary School" });
    } finally {
      vi.useRealTimers();
    }
  });

  describe("the pins the walk is checked against", () => {
    const midway = { lat: (HERE.lat + zone4.evacuationCenterLat) / 2, lng: (HERE.lng + zone4.evacuationCenterLng) / 2 };
    const tree: CommunityPin = {
      id: "p1",
      zoneId: zone1.id,
      statusTag: "road_blocked",
      caption: "Fallen tree",
      lat: midway.lat,
      lng: midway.lng,
      upvotes: 0,
      downvotes: 0,
      createdAt: new Date().toISOString(),
      authorId: "u1",
      removed: false,
    };

    it("asks the server for them as they are now, not the copy the phone kept from when the app opened", async () => {
      // The map's own mount fetch is answered from the service worker's cache, which may be yesterday's.
      const { calls } = stubNetwork({ pins: [], pinsNow: [tree] });
      const { result } = renderSafeRoute(MOCK_ALERTS, HERE);
      await act(async () => {});

      act(() => result.current.findCentre());
      await waitFor(() => expect(result.current.result).not.toBeNull());

      expect(calls.some((c) => c.url.startsWith("/api/pins?"))).toBe(true);
      expect(result.current.result?.problems).toMatchObject([{ kind: "pin", pin: { id: "p1" } }]);
    });

    it("falls back to the pins already loaded when the server cannot be asked", async () => {
      stubNetwork({ pins: [tree], pinsNow: new Error("no signal") });
      const { result } = renderSafeRoute(MOCK_ALERTS, HERE);
      await act(async () => {});

      act(() => result.current.findCentre());
      await waitFor(() => expect(result.current.result).not.toBeNull());

      expect(result.current.result?.problems).toMatchObject([{ kind: "pin", pin: { id: "p1" } }]);
    });

    it("keeps a pin still queued on this phone, which the server has not seen yet", async () => {
      const { addCommunityPin } = await import("@/lib/community-pins");
      stubNetwork({ pins: [], pinsNow: [] });
      addCommunityPin({ zoneId: zone1.id, statusTag: "road_blocked", caption: "Just placed", lat: midway.lat, lng: midway.lng });
      const { result } = renderSafeRoute(MOCK_ALERTS, HERE);
      await act(async () => {});

      act(() => result.current.findCentre());
      await waitFor(() => expect(result.current.result).not.toBeNull());

      expect(result.current.result?.problems).toMatchObject([{ kind: "pin", pin: { caption: "Just placed" } }]);
    });
  });

  it("ignores a tap on a barangay it does not know, and lets the search in progress finish", async () => {
    stubNetwork();
    const { result } = renderSafeRoute(MOCK_ALERTS, HERE);

    act(() => result.current.findCentre());
    act(() => result.current.routeToZone("nowhere"));
    await waitFor(() => expect(result.current.result).not.toBeNull());

    expect(result.current.searching).toBe(false);
  });

  it("says nothing is near, rather than failing, when the likely-site search fails", async () => {
    stubNetwork({ sites: new Error("Overpass is down") });
    const { result } = renderSafeRoute(withZoneAlert("zone-4", { severity: "red" }), HERE);

    act(() => result.current.findCentre());
    await waitFor(() => expect(result.current.result).not.toBeNull());

    expect(result.current.result).toEqual({ status: "none", problems: [], fallback: false });
    expect(result.current.searching).toBe(false);
  });

  it("still names the place, with a straight line, when the route planner cannot be reached", async () => {
    stubNetwork({
      route: () => {
        throw new Error("network down");
      },
    });
    const { result } = renderSafeRoute(MOCK_ALERTS, HERE);

    act(() => result.current.findCentre());
    await waitFor(() => expect(result.current.result).not.toBeNull());

    expect(result.current.result).toMatchObject({
      status: "found",
      fallback: true,
      destination: { name: zone4.evacuationCenterName },
      route: { polyline: [[HERE.lat, HERE.lng], [zone4.evacuationCenterLat, zone4.evacuationCenterLng]] },
    });
  });

  it("checks the walk against the blocking pins on the map", async () => {
    const midway = { lat: (HERE.lat + zone4.evacuationCenterLat) / 2, lng: (HERE.lng + zone4.evacuationCenterLng) / 2 };
    const pin: CommunityPin = {
      id: "p1",
      zoneId: zone1.id,
      statusTag: "road_blocked",
      caption: "Fallen tree",
      lat: midway.lat,
      lng: midway.lng,
      upvotes: 0,
      downvotes: 0,
      createdAt: new Date().toISOString(),
      authorId: "u1",
      removed: false,
    };
    stubNetwork({ pins: [pin] });
    const { result } = renderSafeRoute(MOCK_ALERTS, HERE);
    // The pin arrives with the map's own /api/pins fetch.
    await act(async () => {});

    act(() => result.current.findCentre());
    await waitFor(() => expect(result.current.result).not.toBeNull());

    expect(result.current.result?.problems).toMatchObject([{ kind: "pin", pin: { id: "p1" } }]);
  });

  it("still asks the route planner on a phone that has no AbortSignal.timeout (iOS 15)", async () => {
    const { routeCalls } = stubNetwork();
    const original = AbortSignal.timeout;
    // @ts-expect-error -- an older browser: the static method is not there
    delete AbortSignal.timeout;
    try {
      const { result } = renderSafeRoute(MOCK_ALERTS, HERE);

      act(() => result.current.findCentre());
      await waitFor(() => expect(result.current.result).not.toBeNull());

      expect(routeCalls()).toHaveLength(1);
      expect(result.current.result?.fallback).toBe(false);
    } finally {
      AbortSignal.timeout = original;
    }
  });

  it("recalculates from the current position", async () => {
    const { routeCalls } = stubNetwork();
    const { result, rerender } = renderSafeRoute(MOCK_ALERTS, null);

    act(() => result.current.findCentre());
    await waitFor(() => expect(result.current.result).not.toBeNull());
    expect(result.current.fromBarangay).toBe(true);

    rerender({ livePosition: HERE });
    act(() => result.current.recalculate());
    await waitFor(() => expect(routeCalls()).toHaveLength(2));
    await waitFor(() => expect(result.current.fromBarangay).toBe(false));

    expect(routeCalls()[1].body?.from).toEqual([HERE.lat, HERE.lng]);
  });

  it("finds the nearest barangay with no alert for the find-safe-area action", async () => {
    stubNetwork();
    // Only zone 1 is under an alert, so zones 2, 3 and 4 are Safe and zone 4 is the nearest.
    const alerts = MOCK_ALERTS.filter((a) => a.zoneId === "zone-1");
    const { result } = renderSafeRoute(alerts, HERE);

    act(() => result.current.findArea());
    await waitFor(() => expect(result.current.result).not.toBeNull());

    expect(result.current.result?.destination).toMatchObject({ kind: "area", name: zone4.name });
  });
});
