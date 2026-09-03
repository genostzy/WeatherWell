import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapCanvas } from "./map-canvas";
import { MOCK_ZONES } from "@/lib/mock-data";

/**
 * jsdom has no real layout engine, and Leaflet computes marker/tile
 * positions from actual container geometry. This is deliberately a shallow
 * smoke test — it checks that the component mounts and renders our own
 * legend/selector UI without throwing, not that Leaflet's internal pixel
 * math is correct. That's Leaflet's own tested responsibility, the same
 * principle already applied to Radix primitives elsewhere in this codebase.
 */
describe("MapCanvas", () => {
  const baseProps = {
    zones: MOCK_ZONES,
    hazardType: "flood" as const,
    onHazardTypeChange: () => {},
    routeZone: null,
    routeHazard: false,
    onSelectZone: () => {},
  };

  it("renders without throwing and shows the marker legend and hazard selector", () => {
    render(<MapCanvas {...baseProps} />);
    expect(screen.getByText(/map legend/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /flood/i })).toBeInTheDocument();
  });

  it("calls onSelectZone when a zone status marker is clicked", () => {
    const onSelectZone = vi.fn();
    render(<MapCanvas {...baseProps} onSelectZone={onSelectZone} />);

    fireEvent.click(screen.getByRole("img", { name: /Barangay Nilombot, Mapandan/i }));

    expect(onSelectZone).toHaveBeenCalledWith(MOCK_ZONES[0].id);
  });
});
