import { describe, it, expect, vi } from "vitest";
import { lazy, Suspense, type ComponentType } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomepageMap } from "./homepage-map";
import { MOCK_ZONES } from "@/lib/mock-data";
import { LanguageProvider } from "@/features/i18n/language-provider";

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
          success({ coords: { latitude: 14.647, longitude: 121.1005 } });
          return 1;
        }),
        clearWatch: vi.fn(),
      },
    });

    render(
      <LanguageProvider initialLang="fil">
        <HomepageMap zones={MOCK_ZONES} />
      </LanguageProvider>
    );

    // Clicking the zone-1 status marker selects it as the active evacuation route.
    fireEvent.click(await screen.findByRole("img", { name: /Barangay San Isidro/i }));

    // Filipino must show the localized word, not the bare English "N" code.
    expect(screen.getByText(/Hilaga/)).toBeInTheDocument();
    expect(screen.queryByText(/\bN\b/)).not.toBeInTheDocument();
  });

  it("finds a hazard-free evacuation route when the default one crosses a hazard", async () => {
    const user = userEvent.setup();
    render(<HomepageMap zones={MOCK_ZONES} />);

    // zone-1 (the default route) is tuned to cross a hazard on its own route.
    expect(screen.getByText(/passes through a hazardous area/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /find safe evacuation center/i }));

    expect(screen.queryByText(/passes through a hazardous area/i)).not.toBeInTheDocument();
  });

  it("reports when no zone is currently Safe", async () => {
    const user = userEvent.setup();
    render(<HomepageMap zones={MOCK_ZONES} />);

    // All three mock zones carry an active alert, so none qualify as Safe.
    await user.click(screen.getByRole("button", { name: /^find safe area$/i }));

    expect(screen.getByText(/no zone is currently safe/i)).toBeInTheDocument();
  });
});
