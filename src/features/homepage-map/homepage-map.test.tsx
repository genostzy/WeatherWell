import { describe, it, expect, vi } from "vitest";
import { lazy, Suspense, type ComponentType } from "react";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomepageMap } from "./homepage-map";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import type { Zone } from "@/lib/types";

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

/**
 * The shipped mock zones are real, properly-spaced barangays several km
 * apart (see mock-data.ts), so none of their own short local routes actually
 * cross another zone's hazard — routeCrossesHazard is mocked here so the
 * "finds a hazard-free route" test can exercise that branch deterministically
 * instead of depending on incidental real-world distance.
 */
vi.mock("./route-hazard", () => ({
  routeCrossesHazard: (zone: Zone) => zone.id === "zone-1",
}));

/**
 * MapCanvas's own rendering (legend, hazard selector, markers) has its own
 * dedicated test file; the test below only cares that HomepageMap correctly
 * wires a marker click back into its own state (the compass text it renders
 * itself, outside MapCanvas).
 */
describe("HomepageMap", () => {
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

    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />, { lang: "fil" });

    // Clicking the zone-1 status marker selects it as the active evacuation route.
    fireEvent.click(await screen.findByRole("img", { name: /Barangay Nilombot, Mapandan/i }));

    // Filipino must show the localized word, not the bare English "N" code.
    // Scoped to the route-info text itself (not queryByText across the whole
    // document): the map's own north-orientation badge legitimately renders
    // a literal "N" elsewhere on the page, which a page-wide search would
    // wrongly trip on.
    const routeInfo = screen.getByText(/Hilaga/);
    expect(routeInfo.textContent).toContain("Hilaga");
    expect(routeInfo.textContent).not.toMatch(/\bN\b/);
  });

  it("finds a hazard-free evacuation route when the default one crosses a hazard", async () => {
    const user = userEvent.setup();
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);

    // zone-1 (the default route) is mocked above to cross a hazard.
    expect(screen.getByText(/passes through a hazardous area/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /find safe evacuation center/i }));

    expect(screen.queryByText(/passes through a hazardous area/i)).not.toBeInTheDocument();
    // Evacuation centers are hidden until asked for — this button is one of
    // the two ways to ask.
    expect(screen.getAllByRole("img", { name: /evacuation center/i }).length).toBeGreaterThan(0);
  });

  it("reports when no zone is currently Safe", async () => {
    const user = userEvent.setup();
    renderWithData(<HomepageMap zones={FIXTURE_REFERENCE_DATA.zones} />);

    // All four mock zones carry an active alert, so none qualify as Safe.
    await user.click(screen.getByRole("button", { name: /^find safe area$/i }));

    expect(screen.getByText(/no zone is currently safe/i)).toBeInTheDocument();
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
});
