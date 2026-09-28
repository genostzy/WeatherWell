import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { FIXTURE_REFERENCE_DATA, renderWithData } from "@/test-utils/render-with-data";
import { SEVERITY_HEX } from "@/lib/severity";

// Leaflet needs real layout; what is under test is which barangays get a circle.
vi.mock("react-leaflet", () => ({
  Circle: ({ pathOptions }: { pathOptions: { color: string } }) => (
    <div data-testid="hazard-circle" data-color={pathOptions.color} />
  ),
}));

import { HazardBackdropLayer } from "./hazard-backdrop-layer";

const [a, b] = FIXTURE_REFERENCE_DATA.zones;

describe("HazardBackdropLayer", () => {
  it("draws nothing for a barangay whose hazard is unknown", () => {
    // Every barangay is unknown until real hazard data is loaded; a grey ring
    // around each one (and its evacuation centre) told residents nothing.
    renderWithData(<HazardBackdropLayer zones={[a, b]} hazardType="flood" />, { data: { hazards: {} } });
    expect(screen.queryByTestId("hazard-circle")).not.toBeInTheDocument();
  });

  it("draws a barangay with hazard data in its risk colour", () => {
    renderWithData(<HazardBackdropLayer zones={[a, b]} hazardType="flood" />, {
      data: { hazards: { [a.id]: { flood: "high" }, [b.id]: { flood: "unknown" } } },
    });
    const circles = screen.getAllByTestId("hazard-circle");
    expect(circles).toHaveLength(1);
    expect(circles[0]).toHaveAttribute("data-color", SEVERITY_HEX.red);
  });
});
