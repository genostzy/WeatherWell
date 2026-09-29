import { describe, it, expect, vi, afterEach } from "vitest";
import { lazy, Suspense, type ComponentType } from "react";
import { screen, fireEvent, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomepageMap } from "./homepage-map";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { markConsented } from "@/features/onboarding/onboarding-storage";
import { readOutbox } from "@/lib/outbox/outbox";
import { MOCK_ALERTS } from "@/lib/mock-data";
import type { CandidateSite } from "@/lib/osm-candidates";
import type { CommunityPin } from "@/lib/community-pins";
import type { RouteResponse } from "@/lib/route-types";

/**
 * HomepageMap loads MapCanvas (the actual Leaflet rendering) via next/dynamic
 * with ssr:false. next/dynamic's loading state never resolves under Vitest
 * (no Next.js/webpack runtime backing it here), even though the plain dynamic
 * `import()` it wraps resolves fine — so this mock swaps it for React's own
 * lazy/Suspense, which behaves correctly in any React environment and lets
 * tests await the real MapCanvas exactly as production eventually renders it.
 */
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<ComponentType<Record<string, unknown>>>) => {
    const LazyComponent = lazy(() => loader().then((Component) => ({ default: Component })));
    return function DynamicMock(props: Record<string, unknown>) {
      return (
        <Suspense fallback={null}>
          <LazyComponent {...props} />
        </Suspense>
      );
    };
  },
}));

// The push prompt's own behaviour has its own tests; here only which barangay it gets matters.
vi.mock("@/features/onboarding/push-prompt", () => ({
  PushPrompt: ({ zoneId }: { zoneId?: string }) => <p>push:{zoneId}</p>,
}));

/**
 * MapCanvas's own rendering (legend, hazard selector, markers) has its own
 * dedicated test file; the test below only cares that HomepageMap correctly
 * wires a marker click back into its own state (the compass text it renders
 * itself, outside MapCanvas).
 */
describe("HomepageMap: which barangay a report counts for", () => {
  const [shown, mine, here] = FIXTURE_REFERENCE_DATA.zones;

  function standAt(lat: number, lng: number) {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: vi.fn((success) => {
          success({ coords: { latitude: lat, longitude: lng } });
          return 1;
        }),
        clearWatch: vi.fn(),
      },
    });
    window.localStorage.clear();
    markConsented();
  }

  it("reports count where GPS puts you, not the barangay on screen", async () => {
    standAt(here.lat + 0.009, here.lng);
    renderWithData(<HomepageMap zones={[shown, mine, here]} myZoneId={mine.id} />);
    expect(await screen.findByText(`Reporting for ${here.name} (where you are)`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /knee-deep/i }));
    expect(readOutbox()[0].payload).toMatchObject({ zoneId: here.id });
  });

  it("with GPS far from every barangay, reports count for my barangay", async () => {
    standAt(mine.lat + 0.5, mine.lng + 0.5);
    renderWithData(<HomepageMap zones={[shown, mine, here]} myZoneId={mine.id} />);
    expect(await screen.findByText(`Reporting for ${mine.name} (your barangay)`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /knee-deep/i }));
    expect(readOutbox()[0].payload).toMatchObject({ zoneId: mine.id });
  });
});

describe("HomepageMap", () => {
  it("keeps push alerts on my barangay while showing another", () => {
    const [mine, shown] = FIXTURE_REFERENCE_DATA.zones;
    renderWithData(<HomepageMap zones={[shown, mine]} myZoneId={mine.id} />);
    expect(screen.getByText(`push:${mine.id}`)).toBeInTheDocument();
    expect(screen.getByText(`Viewing ${shown.name}. Your alerts still come for ${mine.name}.`)).toBeInTheDocument();
  });

  it("offers to add a pin of any kind, not only a flood pin", () => {
    const [mine, shown] = FIXTURE_REFERENCE_DATA.zones;
    renderWithData(<HomepageMap zones={[shown, mine]} myZoneId={mine.id} />);
    expect(screen.getByRole("button", { name: "Add pin" })).toBeInTheDocument();
  });

  it("renders the direction-to-safety compass label localized, not as a bare code", async () => {
    // zone-1's evacuation center sits due north (same lng) of this stubbed live
    // position, so getBearingAndDistance deterministically returns "N".
    // Deliberately not vi.stubGlobal("navigator", ...): replacing the whole
    // object strips userAgent/platform/etc that Leaflet's own browser
    // detection reads at module-init time, crashing it. Only geolocation is
    // faked here, everything else on the real navigator stays intact. Left
    // in place (not restored) for the rest of the suite run — deleting it in
    // afterEach races React's own unmount effect, which also calls
    // navigator.geolocation.clearWatch.
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: vi.fn((success) => {
          success({ coords: { latitude: 16.0, longitude: 120.436 } });
          return 1;
        }),
        clearWatch: vi.fn(),
      },
    });
    // The home screen only mounts after the consent notice, which the position needs.
    markConsented();

    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />, { lang: "fil" });

    // Tapping the zone-1 status marker routes to its evacuation center.
    // The map canvas is lazy-loaded; under full-suite load its first render
    // can take longer than findBy's 1s default.
    fireEvent.click(await screen.findByRole("img", { name: /Barangay Nilombot, Mapandan/i }, { timeout: 5000 }));

    // Filipino must show the localized word, not the bare English "N" code.
    // Scoped to the route-info text itself (not queryByText across the whole
    // document): the map's own north-orientation badge legitimately renders
    // a literal "N" elsewhere on the page, which a page-wide search would
    // wrongly trip on.
    const routeInfo = await screen.findByText(/Hilaga/);
    expect(routeInfo.textContent).toContain("Hilaga");
    expect(routeInfo.textContent).not.toMatch(/\bN\b/);
  });

  it("does not reveal evacuation centers from 'Find safe area' alone", async () => {
    // Find safe area routes to a safe ZONE, not specifically to an
    // evacuation center — only the evacuation-center search, or the
    // resident's own search box, should surface the shelter layer.
    const user = userEvent.setup();
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);

    await user.click(screen.getByRole("button", { name: /^find safe area$/i }));

    expect(screen.queryByRole("img", { name: /evacuation center/i })).not.toBeInTheDocument();
  });

  it("offers flood alerts on this phone from the home screen, not only during first setup (found testing push on a phone)", () => {
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(screen.getByRole("region", { name: /alerts on this phone/i })).toBeInTheDocument();
  });

  it("marks which quick action's route is on the map (owner's request: the selected view must stand out)", async () => {
    const { NAV_ACTIVE } = await import("@/components/nav-active");
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    const safeArea = screen.getByRole("button", { name: /find safe area/i });
    const centre = screen.getByRole("button", { name: /find safe evacuation center/i });
    expect(safeArea).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(safeArea);
    expect(safeArea).toHaveAttribute("aria-pressed", "true");
    expect(safeArea.className).toContain(NAV_ACTIVE);
    expect(centre).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(centre);
    expect(centre).toHaveAttribute("aria-pressed", "true");
    expect(centre.className).toContain(NAV_ACTIVE);
    expect(safeArea.className).not.toContain(NAV_ACTIVE);
  });

  it("on a phone, reads status, then the safety actions, then the map, then the rest (owner: tidy phone layout)", () => {
    const { container } = renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    const order = (el: Element | null) => [...container.querySelectorAll("*")].indexOf(el as Element);
    const status = screen.getByRole("heading", { level: 1 });
    const safeArea = screen.getByRole("button", { name: /find safe area/i });
    const map = container.querySelector("[data-home-map]");
    const alertsCard = screen.getByRole("region", { name: /alerts on this phone/i });
    expect(order(status)).toBeLessThan(order(safeArea));
    expect(order(safeArea)).toBeLessThan(order(map));
    expect(order(map)).toBeLessThan(order(alertsCard));
  });

  it("fits the single phone column to the screen instead of growing to the map's width", () => {
    const { container } = renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect((container.querySelector("[data-home-grid]") as HTMLElement).className).toContain("grid-cols-[minmax(0,1fr)]");
  });
});

/**
 * "Find safe evacuation center" and "Find safe area": where they point, the
 * walk, and what was checked. The mock barangays: zone-1 (on screen) is under
 * Warning, zones 2 and 3 under Evacuate, zone 4 under a yellow Advisory, so the
 * only place a resident of zone 1 may be sent is zone 4's centre.
 */
describe("HomepageMap: find a safe place", () => {
  const [zone1, zone2, , zone4] = FIXTURE_REFERENCE_DATA.zones;
  type Body = { from: [number, number]; to: [number, number] };

  /** No position, or one; the position needs the consent notice's stored answer. */
  function standingAt(position: { lat: number; lng: number } | null) {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: position
        ? {
            watchPosition: vi.fn((success) => {
              success({ coords: { latitude: position.lat, longitude: position.lng } });
              return 1;
            }),
            clearWatch: vi.fn(),
          }
        : undefined,
    });
    window.localStorage.clear();
    markConsented();
  }

  const walk = (body: Body): RouteResponse => ({
    routes: [{ polyline: [body.from, body.to], distanceMeters: 4800, durationSeconds: 3600 }],
    fallback: false,
  });

  /** The network as the screen sees it; any other address fails, as in production with no signal. */
  function stubNetwork(options: { route?: (body: Body) => RouteResponse; pins?: CommunityPin[]; sites?: CandidateSite[] } = {}) {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/route") return { ok: true, json: async () => (options.route ?? walk)(JSON.parse(String(init?.body))) };
      if (url.startsWith("/api/evacuation-candidates")) return { ok: true, json: async () => options.sites ?? [] };
      if (url.startsWith("/api/pins")) return { ok: true, json: async () => options.pins ?? [] };
      throw new Error(`not stubbed: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const routeCalls = (fetchMock: ReturnType<typeof stubNetwork>) => fetchMock.mock.calls.filter(([url]) => url === "/api/route");
  const findCentre = () => screen.getByRole("button", { name: /find safe evacuation center/i });
  const findArea = () => screen.getByRole("button", { name: /^find safe area$/i });
  const panel = async () => within(await screen.findByRole("region", { name: /directions to a safe place|direksyon papunta sa ligtas na lugar/i }));

  afterEach(() => vi.unstubAllGlobals());

  it("shows nothing, and fetches no route, until asked", async () => {
    standingAt(null);
    const fetchMock = stubNetwork();
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    await act(async () => {});

    expect(screen.queryByRole("region", { name: /directions to a safe place/i })).not.toBeInTheDocument();
    expect(routeCalls(fetchMock)).toHaveLength(0);
  });

  it("Find safe evacuation center names the place, the walk and what was checked", async () => {
    standingAt(null);
    stubNetwork();
    const user = userEvent.setup();
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);

    await user.click(findCentre());

    const directions = await panel();
    expect(await directions.findByText(`4.8 km · 60 min walk to ${zone4.evacuationCenterName}`)).toBeInTheDocument();
    expect(directions.getByText("Avoids barangays under Warning or Evacuate and blocked roads reported by residents")).toBeInTheDocument();
    // No position: the walk starts at the barangay's point, and says so.
    expect(directions.getByText("From your barangay — turn on location for directions from where you are")).toBeInTheDocument();
    expect(directions.queryByText("Not confirmed by your barangay")).not.toBeInTheDocument();
    // The map marks where the walk ends.
    expect(await screen.findByRole("img", { name: `Destination — ${zone4.evacuationCenterName}` }, { timeout: 5000 })).toBeInTheDocument();
  });

  it("says what a route passes when every route is affected", async () => {
    standingAt(null);
    // The walk bends through zone 2, which is under Evacuate, and passes a fallen tree.
    const start: [number, number] = [zone1.lat, zone1.lng];
    const bend: [number, number] = [zone2.lat, zone2.lng];
    const end: [number, number] = [zone4.evacuationCenterLat, zone4.evacuationCenterLng];
    const tree = { lat: start[0] + (bend[0] - start[0]) * 0.2, lng: start[1] + (bend[1] - start[1]) * 0.2 };
    stubNetwork({
      route: () => ({ routes: [{ polyline: [start, bend, end], distanceMeters: 9000, durationSeconds: 6500 }], fallback: false }),
      pins: [
        {
          id: "p1",
          zoneId: zone1.id,
          statusTag: "road_blocked",
          caption: "Fallen tree",
          lat: tree.lat,
          lng: tree.lng,
          upvotes: 0,
          downvotes: 0,
          createdAt: new Date().toISOString(),
          authorId: "u1",
          removed: false,
        },
      ],
    });
    const user = userEvent.setup();
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    // The pin has reached the map, and with it the search.
    await screen.findByRole("img", { name: /road blocked/i }, { timeout: 5000 });

    await user.click(findCentre());

    const directions = await panel();
    expect(await directions.findByText(/^This route passes a Road blocked pin \(about \d+ m from you\)$/)).toBeInTheDocument();
    expect(directions.getByText(`This route passes near ${zone2.name}, under Evacuate Now`)).toBeInTheDocument();
    expect(directions.queryByText(/^Avoids barangays under Warning or Evacuate/)).not.toBeInTheDocument();
  });

  it("marks a place OpenStreetMap suggested as not confirmed by the barangay, and passes over one inside a barangay under alert", async () => {
    standingAt(null);
    // Zone 4 has no confirmed centre, so the search falls to likely sites. The hall is in zone 1, which is
    // under Warning; the school is by zone 4, which has no alert.
    const hall: CandidateSite = { name: "Nilombot Barangay Hall", kind: "hall", lat: zone1.lat + 0.001, lng: zone1.lng, distanceM: 110 };
    const school: CandidateSite = { name: "Santa Barbara Elementary School", kind: "school", lat: zone4.lat + 0.0005, lng: zone4.lng, distanceM: 55 };
    stubNetwork({ sites: [hall, school] });
    const user = userEvent.setup();
    const zones = FIXTURE_REFERENCE_DATA.zones.map((z) => (z.id === zone4.id ? { ...z, evacuationCenterName: "" } : z));
    renderWithData(<HomepageMap zones={zones} />);

    await user.click(findCentre());

    const directions = await panel();
    expect(await directions.findByText(/walk to Santa Barbara Elementary School$/)).toBeInTheDocument();
    expect(directions.getByText("Not confirmed by your barangay")).toBeInTheDocument();
    expect(directions.queryByText(/Nilombot Barangay Hall/)).not.toBeInTheDocument();
  });

  it("shows the call button while it is still searching, not only after", async () => {
    standingAt(null);
    // The route planner never answers.
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => (String(input) === "/api/route" ? new Promise(() => {}) : Promise.resolve({ ok: true, json: async () => [] })))
    );
    const user = userEvent.setup();
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);

    await user.click(findCentre());

    const directions = await panel();
    expect(directions.getByText("Finding the nearest safe place…")).toBeInTheDocument();
    expect(directions.getByRole("link", { name: `Call ${zone1.hotlineNumber}` })).toBeInTheDocument();
    expect(directions.queryByRole("button", { name: "Recalculate" })).not.toBeInTheDocument();
  });

  it("announces what a search found, but not the compass line that changes with every step", async () => {
    standingAt({ lat: 16.029, lng: 120.436 });
    stubNetwork();
    const user = userEvent.setup();
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);

    await user.click(findCentre());

    const directions = await panel();
    expect((await directions.findByText(/min walk to/)).closest("[aria-live]")).not.toBeNull();
    const compass = directions.getByText(new RegExp(`m (N|NE|E|SE|S|SW|W|NW) to ${zone4.evacuationCenterName}$`));
    expect(compass.closest("[aria-live]")).toBeNull();
  });

  it("Find safe area names the nearest barangay with no alert", async () => {
    standingAt(null);
    stubNetwork();
    const user = userEvent.setup();
    // Only zone 1 is under an alert, so zones 2, 3 and 4 have none, and zone 4 is the nearest.
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />, { alerts: MOCK_ALERTS.filter((a) => a.zoneId === zone1.id) });

    await user.click(findArea());

    const directions = await panel();
    expect(await directions.findByText(`Nearest barangay with no alert: ${zone4.name}`)).toBeInTheDocument();
  });

  it("says no barangay near you is free of alerts, with the call button", async () => {
    standingAt(null);
    stubNetwork();
    const user = userEvent.setup();
    // Every mock barangay carries an active alert.
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);

    await user.click(findArea());

    const directions = await panel();
    expect(await directions.findByText(/^No alert-free barangay within 10 km — go to higher ground and call your barangay or 911$/)).toBeInTheDocument();
    expect(directions.getByRole("link", { name: /^Call / })).toBeInTheDocument();
  });

  it("shows the call button with the barangay's hotline, or 911", async () => {
    standingAt(null);
    stubNetwork();
    const user = userEvent.setup();
    const first = renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    await user.click(findCentre());
    expect(await (await panel()).findByRole("link", { name: `Call ${zone1.hotlineNumber}` })).toHaveAttribute("href", `tel:${zone1.hotlineNumber}`);
    first.unmount();

    // A barangay whose hotline is still the seed's placeholder has no number to call.
    const placeholder = FIXTURE_REFERENCE_DATA.zones.map((z, i) => (i === 0 ? { ...z, hotlineNumber: "0000000000" } : z));
    renderWithData(<HomepageMap zones={placeholder} />);
    await user.click(findCentre());
    expect(await (await panel()).findByRole("link", { name: "Call 911" })).toHaveAttribute("href", "tel:911");
  });

  it("says nothing is near, with the call button, when nothing is in reach", async () => {
    standingAt(null);
    stubNetwork({ sites: [] });
    const user = userEvent.setup();
    const allUnderWarning = MOCK_ALERTS.map((a) => ({ ...a, severity: "red" as const }));
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />, { alerts: allUnderWarning });

    await user.click(findCentre());

    const directions = await panel();
    expect(
      await directions.findByText("No evacuation centre found near you — go to higher ground and call your barangay or 911")
    ).toBeInTheDocument();
    expect(directions.getByRole("link", { name: `Call ${zone1.hotlineNumber}` })).toBeInTheDocument();
  });

  it("names the place and marks the walk as a straight line when the route planner does not answer", async () => {
    standingAt(null);
    stubNetwork({
      route: () => {
        throw new Error("route planner down");
      },
    });
    const user = userEvent.setup();
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);

    await user.click(findCentre());

    const directions = await panel();
    expect(await directions.findByText("Straight line — the route planner didn't answer")).toBeInTheDocument();
    expect(directions.getByText(new RegExp(`${zone4.evacuationCenterName}$`))).toBeInTheDocument();
  });

  it("asks again from the current position when Recalculate is pressed", async () => {
    standingAt(null);
    const fetchMock = stubNetwork();
    const user = userEvent.setup();
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);

    await user.click(findCentre());
    const directions = await panel();
    await directions.findByText(/min walk to/);
    expect(routeCalls(fetchMock)).toHaveLength(1);

    await user.click(directions.getByRole("button", { name: "Recalculate" }));

    await directions.findByText(/min walk to/);
    expect(routeCalls(fetchMock)).toHaveLength(2);
  });

  it("reads in Filipino when the language is Filipino", async () => {
    standingAt(null);
    stubNetwork();
    const user = userEvent.setup();
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />, { lang: "fil" });

    await user.click(screen.getByRole("button", { name: /hanapin ang ligtas na evacuation center/i }));

    const directions = await panel();
    expect(await directions.findByText(`4.8 km · 60 minutong lakad papunta sa ${zone4.evacuationCenterName}`)).toBeInTheDocument();
    expect(directions.getByText("Iniiwasan ang barangay na may Warning o Evacuate at mga saradong daan na iniulat ng residente")).toBeInTheDocument();
    expect(directions.getByRole("button", { name: "Kalkulahin muli" })).toBeInTheDocument();
  });
});
