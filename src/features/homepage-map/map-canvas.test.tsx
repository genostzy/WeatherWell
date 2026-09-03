import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapCanvas } from "./map-canvas";
import { MOCK_ZONES } from "@/lib/mock-data";
import { addCommunityPin } from "@/lib/community-pins";

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

  describe("community pin actions", () => {
    beforeEach(() => {
      localStorage.clear();
      localStorage.setItem("weatherwell.communityPins", "[]");
    });

    it("hands this device's own pin back to onDeletePin rather than deleting it itself", () => {
      // MapCanvas only reports the intent — HomepageMap owns the actual
      // confirm-then-delete flow (see ConfirmDialog), so this pin must still
      // exist in storage after the click.
      addCommunityPin({ zoneId: "zone-1", statusTag: "rising", caption: "Mine", lat: 16.03, lng: 120.44 });
      const onDeletePin = vi.fn();

      render(<MapCanvas {...baseProps} onDeletePin={onDeletePin} />);
      fireEvent.click(screen.getByRole("img", { name: /Rising/i }));
      fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));

      expect(onDeletePin).toHaveBeenCalledWith(expect.objectContaining({ caption: "Mine" }));
      expect(JSON.parse(localStorage.getItem("weatherwell.communityPins")!)).toHaveLength(1);
    });

    it("only offers Edit/Delete on a pin this device created", () => {
      addCommunityPin({ zoneId: "zone-1", statusTag: "flooded", caption: "Someone else's", lat: 16.03, lng: 120.44 });
      const pins = JSON.parse(localStorage.getItem("weatherwell.communityPins")!);
      pins[0].deviceId = "a-different-device";
      localStorage.setItem("weatherwell.communityPins", JSON.stringify(pins));

      render(<MapCanvas {...baseProps} />);
      fireEvent.click(screen.getByRole("img", { name: /Flooded/i }));

      expect(screen.queryByRole("button", { name: /^Delete$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Edit$/i })).not.toBeInTheDocument();
    });
  });
});
