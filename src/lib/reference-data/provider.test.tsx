import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { ReferenceDataProvider, FETCH_TIMEOUT_MS } from "./provider";
import { useZones, usePois, useHazardsForZone } from "./use-reference-data";
import { useAlerts } from "@/lib/alerts-store";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { ONBOARDED_KEY } from "@/features/onboarding/onboarding-storage";
import type { AlertRecord } from "@/lib/types";

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn(() => "/") }));
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

function ZoneNames() {
  const zones = useZones();
  return <ul>{zones.map((z) => <li key={z.id}>{z.name}</li>)}</ul>;
}

function PoiNames() {
  const pois = usePois();
  return <ul>{pois.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}

function HazardLevels({ zoneId }: { zoneId: string }) {
  const hazards = useHazardsForZone(zoneId);
  return <span data-testid="hazards">{JSON.stringify(hazards)}</span>;
}

function AlertIds() {
  const alerts = useAlerts();
  return <span data-testid="alert-ids">{alerts.map((a) => a.id).join(",")}</span>;
}

const ALERT: AlertRecord = {
  id: "alert-1",
  zoneId: "zone-1",
  severity: "red",
  message: { en: "Knee-deep flooding reported.", fil: "May baha hanggang tuhod." },
  source: "manual",
  confidence: "validated",
  issuedAt: "2026-09-07T02:00:00.000Z",
  isActive: true,
};

/** A fetch mock that mimics real fetch: never settles until its AbortSignal fires. */
function hangingFetch(url: string, options?: { signal?: AbortSignal }) {
  return new Promise<never>((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => {
      reject(new DOMException("The operation was aborted.", "AbortError"));
    });
  });
}

const ONE_ZONE = {
  zones: [{ id: "zone-1", name: "Barangay Nilombot, Mapandan" }],
  pois: [],
  hazards: {},
};

const ZONE_WITH_POIS_AND_HAZARDS = {
  zones: [{ id: "zone-1", name: "Barangay Nilombot, Mapandan" }],
  pois: [{ id: "poi-1", zoneId: "zone-1", category: "health_center", name: "Mapandan District Health Center", lat: 0, lng: 0 }],
  hazards: { "zone-1": { flood: "high" } },
};

function renderProvider() {
  render(
    <LanguageProvider>
      <ReferenceDataProvider>
        <ZoneNames />
      </ReferenceDataProvider>
    </LanguageProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  mockUsePathname.mockReturnValue("/");
  // Every existing test in this file predates the bypass-gate feature and is
  // about the ordinary gate, not onboarding — default to "already onboarded"
  // so bypassGate stays false for them. The bypassGate describe block below
  // clears this itself for the cases that need "not yet onboarded".
  window.localStorage.setItem(ONBOARDED_KEY, "true");
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("ReferenceDataProvider", () => {
  it("does not render children until the data is in hand", () => {
    // The whole design rests on this: consumers may assume zones exist.
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderProvider();
    expect(screen.queryByText("Barangay Nilombot, Mapandan")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("lays live centre changes over the static file, so residents see what officials set", async () => {
    function CentreName() {
      const zones = useZones();
      return <span data-testid="centre">{zones[0]?.evacuationCenterName}/{zones[0]?.centerStatus}</span>;
    }
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes("/api/centres")
          ? [{ zone_id: "zone-1", name: "Nilombot Elementary School", lat: 1, lng: 2, capacity: 300, status: "full", current_occupancy: null }]
          : String(url).includes("/api/alerts")
            ? []
            : { zones: [{ id: "zone-1", name: "Barangay Nilombot, Mapandan", evacuationCenterName: "", centerStatus: "unknown" }], pois: [], hazards: {} },
    }));
    render(
      <LanguageProvider>
        <ReferenceDataProvider>
          <CentreName />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    expect(await screen.findByText("Nilombot Elementary School/full")).toBeInTheDocument();
  });

  it("keeps the static centres when the live overlay fails", async () => {
    function CentreName() {
      const zones = useZones();
      return <span data-testid="centre">{zones[0]?.evacuationCenterName}</span>;
    }
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) =>
      String(url).includes("/api/centres")
        ? { ok: false, json: async () => ({}) }
        : {
            ok: true,
            json: async () =>
              String(url).includes("/api/alerts") ? [] : { zones: [{ id: "zone-1", name: "N", evacuationCenterName: "Static School" }], pois: [], hazards: {} },
          }
    );
    render(
      <LanguageProvider>
        <ReferenceDataProvider>
          <CentreName />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    expect(await screen.findByText("Static School")).toBeInTheDocument();
  });

  it("renders children once the data arrives", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ONE_ZONE,
    });
    renderProvider();
    expect(await screen.findByText("Barangay Nilombot, Mapandan")).toBeInTheDocument();
  });

  it("expands the compact static file (H1) before handing zones to children", async () => {
    function Hotline() {
      const zones = useZones();
      return <span data-testid="hotline">{zones[0]?.hotlineNumber} {zones[0]?.municipalityName}</span>;
    }
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        format: 2,
        zones: [{ id: "zone-0102923008", name: "Barangay Subec, Santa Catalina", place: 0, lat: 17.58, lng: 120.34 }],
        places: [["Santa Catalina", "Ilocos Sur"]],
        routes: [{ en: "Go to higher ground.", fil: "Pumunta sa mataas na lugar." }],
        pois: [],
        hazards: {},
      }),
    });
    render(
      <LanguageProvider>
        <ReferenceDataProvider>
          <Hotline />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    expect(await screen.findByTestId("hotline")).toHaveTextContent("00000000000 Santa Catalina");
  });

  it("expands the real static file's interned evacuationRouteText before handing zones to children", async () => {
    // The real /data/reference-data.json (unlike this file's other fixtures)
    // carries an evacuationRouteTextTable and each zone's evacuationRouteText
    // as an index into it — the previous format, which a service worker may still have cached.
    function RouteText() {
      const zones = useZones();
      return <span data-testid="route-text">{zones[0]?.evacuationRouteText.en}</span>;
    }
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        zones: [{ id: "zone-1", name: "Barangay Nilombot, Mapandan", evacuationRouteText: 0 }],
        evacuationRouteTextTable: [{ en: "Head to the barangay road.", fil: "Dumaan sa barangay road." }],
        pois: [],
        hazards: {},
      }),
    });
    render(
      <LanguageProvider>
        <ReferenceDataProvider>
          <RouteText />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    expect(await screen.findByTestId("route-text")).toHaveTextContent("Head to the barangay road.");
  });

  it("tells the resident it cannot reach the data instead of spinning forever", async () => {
    // A device that is offline AND has never cached /data/reference-data.json. An indefinite
    // spinner during a flood is the worst possible answer.
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    renderProvider();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toMatch(/offline|connection|reach/i);
  });

  it("treats a non-ok response as a failure, not as empty data", async () => {
    // A 502 that produced an empty zone list would read as "no zones alerting".
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    renderProvider();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("offers a way to retry, since the network may come back", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    renderProvider();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeInTheDocument();
  });

  it("shows the failure card when zones succeed but alerts answer non-ok (I7)", async () => {
    // The exact mixed state the gate exists for: a page showing every zone
    // with no alert data reads as "every barangay is safe", so this must not
    // silently fall through to "ready".
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/data/reference-data.json") return Promise.resolve({ ok: true, json: async () => ONE_ZONE });
      return Promise.resolve({ ok: false, status: 502, json: async () => ({}) });
    });
    renderProvider();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("Barangay Nilombot, Mapandan")).not.toBeInTheDocument();
  });

  it("shows the failure card when zones succeed but the alerts fetch rejects (I7)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/data/reference-data.json") return Promise.resolve({ ok: true, json: async () => ONE_ZONE });
      return Promise.reject(new TypeError("Failed to fetch"));
    });
    renderProvider();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText("Barangay Nilombot, Mapandan")).not.toBeInTheDocument();
  });

  it("passes the fetched alerts through to children rather than an empty array (I7)", async () => {
    // Changing the provider to pass alerts: [] must fail this test — it did
    // not fail any test before this one existed.
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === "/data/reference-data.json") return Promise.resolve({ ok: true, json: async () => ONE_ZONE });
      return Promise.resolve({ ok: true, json: async () => [ALERT] });
    });
    render(
      <LanguageProvider>
        <ReferenceDataProvider>
          <AlertIds />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    expect(await screen.findByTestId("alert-ids")).toHaveTextContent(ALERT.id);
  });

  it("reaches the failure card rather than hanging forever when a fetch never settles (C2)", async () => {
    vi.useFakeTimers();
    try {
      (fetch as ReturnType<typeof vi.fn>).mockImplementation(hangingFetch);
      renderProvider();
      expect(screen.getByRole("status")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
      });

      expect(screen.getByRole("alert")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

/** Deliberately reads nothing from ReferenceDataContext — stands in for onboarding's real content, which resolves a zone over the network instead. */
function Plain() {
  return <p>plain content</p>;
}

describe("ReferenceDataProvider's bypassGate", () => {
  function renderBypassable() {
    render(
      <LanguageProvider>
        <ReferenceDataProvider>
          <Plain />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
  }

  it("renders children immediately on /onboarding, even mid-onboarding fetch", () => {
    mockUsePathname.mockReturnValue("/onboarding");
    window.localStorage.clear(); // not yet onboarded — the realistic case for this route
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {})); // never resolves
    renderBypassable();
    expect(screen.getByText("plain content")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders children immediately on / for a not-yet-onboarded visitor", () => {
    // This is what lets OnboardingGate (a child of this provider, rendered
    // on /) redirect a first-time visitor without first waiting on the full
    // nationwide fetch — see the provider's own doc comment.
    mockUsePathname.mockReturnValue("/");
    window.localStorage.clear();
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderBypassable();
    expect(screen.getByText("plain content")).toBeInTheDocument();
  });

  it("does not bypass on / once the visitor is confirmed onboarded", () => {
    mockUsePathname.mockReturnValue("/");
    window.localStorage.setItem(ONBOARDED_KEY, "true");
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderBypassable();
    expect(screen.queryByText("plain content")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders children immediately on /a regardless of onboarded status — the shared-alert route needs no reference data at all", () => {
    mockUsePathname.mockReturnValue("/a");
    window.localStorage.setItem(ONBOARDED_KEY, "true"); // even an already-onboarded resident's device must not wait
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {})); // never resolves — 22MB fetch that must not gate this route
    renderBypassable();
    expect(screen.getByText("plain content")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not bypass a stale deep link to another route, even while not onboarded", () => {
    // A not-yet-onboarded visitor landing on e.g. /evacuation (a stale
    // bookmark, a restored session) must keep its current behavior — render
    // gated on real data like any other route — not start throwing "no
    // ReferenceDataProvider ancestor" because this bypassed the gate there
    // too. Only / and /onboarding are exempt.
    mockUsePathname.mockReturnValue("/evacuation");
    window.localStorage.clear();
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderBypassable();
    expect(screen.queryByText("plain content")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("never bypasses gatedExtras, even while children bypass the gate (regression: this used to crash the /onboarding build)", () => {
    // gatedExtras stands in for the root layout's SelectedZoneHotlineButton
    // and TilePrecacher — global widgets mounted alongside {children} that
    // call useZones() themselves. Before gatedExtras existed, they were
    // plain children too, so bypassing the gate for the onboarding page
    // bypassed it for them as well and they threw "no ReferenceDataProvider
    // ancestor" — caught by `next build` prerendering /onboarding, not by
    // any unit test. This is that test.
    mockUsePathname.mockReturnValue("/onboarding");
    window.localStorage.clear();
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(
      <LanguageProvider>
        <ReferenceDataProvider gatedExtras={<ZoneNames />}>
          <Plain />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    // The bypassable page content shows immediately...
    expect(screen.getByText("plain content")).toBeInTheDocument();
    // ...but the real-data-dependent widget waits, rather than throwing.
    expect(screen.queryByText("Barangay Nilombot, Mapandan")).not.toBeInTheDocument();
  });

  it("renders gatedExtras once data arrives, even on a bypassed route", async () => {
    mockUsePathname.mockReturnValue("/onboarding");
    window.localStorage.clear();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ONE_ZONE,
    });
    render(
      <LanguageProvider>
        <ReferenceDataProvider gatedExtras={<ZoneNames />}>
          <Plain />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    expect(screen.getByText("plain content")).toBeInTheDocument();
    expect(await screen.findByText("Barangay Nilombot, Mapandan")).toBeInTheDocument();
  });
});

describe("useZones outside a provider", () => {
  it("throws a directive error rather than returning an empty array", () => {
    // Silently returning [] is how "no zones" becomes indistinguishable from
    // "no alerts anywhere". Fail at the developer, not at the resident.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ZoneNames />)).toThrow(/ReferenceDataProvider/);
    quiet.mockRestore();
  });
});

describe("usePois", () => {
  it("exposes the points of interest from the fetched reference data", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ZONE_WITH_POIS_AND_HAZARDS,
    });
    render(
      <LanguageProvider>
        <ReferenceDataProvider>
          <PoiNames />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    expect(await screen.findByText("Mapandan District Health Center")).toBeInTheDocument();
  });
});

describe("ReferenceDataProvider's chrome prop (fix round 1, finding 5)", () => {
  function renderWithChrome(childUi = <ZoneNames />) {
    return render(
      <LanguageProvider>
        <ReferenceDataProvider chrome={<div data-testid="chrome">chrome content</div>}>
          {childUi}
        </ReferenceDataProvider>
      </LanguageProvider>
    );
  }

  it("renders chrome while data is loading, alongside the loading status", () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderWithChrome();
    expect(screen.getByTestId("chrome")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders chrome after a load failure, alongside the failure card", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithChrome();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByTestId("chrome")).toBeInTheDocument();
  });

  it("renders chrome once data is ready, alongside the real children", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ONE_ZONE,
    });
    renderWithChrome();
    expect(await screen.findByText("Barangay Nilombot, Mapandan")).toBeInTheDocument();
    expect(screen.getByTestId("chrome")).toBeInTheDocument();
  });

  it("renders nothing extra when chrome is omitted, leaving every existing call site unchanged", () => {
    // Guards the "existing assertions stay unchanged" rule: a provider with
    // no `chrome` prop (every call site before this fix round) must behave
    // exactly as it did — this is the same render `renderProvider()` above
    // uses, just spelled out here to keep the point next to the new tests.
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderProvider();
    expect(screen.queryByTestId("chrome")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("useHazardsForZone", () => {
  it("returns the hazard levels for a known zone", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ZONE_WITH_POIS_AND_HAZARDS,
    });
    render(
      <LanguageProvider>
        <ReferenceDataProvider>
          <HazardLevels zoneId="zone-1" />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    // The fixture rates flood only; the types it does not rate read
    // "unknown" rather than being absent (I3).
    await waitFor(() =>
      expect(screen.getByTestId("hazards").textContent).toBe(
        JSON.stringify({ flood: "high", landslide: "unknown", storm_surge: "unknown", dam_release: "unknown" })
      )
    );
  });

  it("falls back to an all-unknown record for an unknown zone rather than throwing", async () => {
    // An unwired or mistyped zone id, or a barangay with no hazard rows, must
    // render as "no hazard data", not crash the page. It used to fall back to
    // an empty record, which every reader then dereferenced into undefined
    // and crashed on (I3); every type now reads "unknown".
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ZONE_WITH_POIS_AND_HAZARDS,
    });
    render(
      <LanguageProvider>
        <ReferenceDataProvider>
          <HazardLevels zoneId="zone-does-not-exist" />
        </ReferenceDataProvider>
      </LanguageProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("hazards").textContent).toBe(
        JSON.stringify({ flood: "unknown", landslide: "unknown", storm_surge: "unknown", dam_release: "unknown" })
      )
    );
  });
});
