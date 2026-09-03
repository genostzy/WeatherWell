import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HomepageMap } from "./homepage-map";
import { MOCK_ZONES } from "@/lib/mock-data";
import { LanguageProvider } from "@/features/i18n/language-provider";

/**
 * jsdom has no real layout engine, and Leaflet computes marker/tile
 * positions from actual container geometry. This is deliberately a shallow
 * smoke test — it checks that the component mounts and renders our own
 * legend/selector UI without throwing, not that Leaflet's internal pixel
 * math is correct. That's Leaflet's own tested responsibility, the same
 * principle already applied to Radix primitives elsewhere in this codebase.
 */
describe("HomepageMap", () => {
  it("renders without throwing and shows the marker legend and hazard selector", () => {
    render(<HomepageMap zones={MOCK_ZONES} />);
    expect(screen.getByText(/map legend/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /flood/i })).toBeInTheDocument();
  });

  it("renders the direction-to-safety compass label localized, not as a bare code", () => {
    // zone-1's evacuation center sits due north (same lng) of this stubbed live
    // position, so getBearingAndDistance deterministically returns "N".
    vi.stubGlobal("navigator", {
      geolocation: {
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
    fireEvent.click(screen.getByRole("img", { name: /Barangay San Isidro/i }));

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
