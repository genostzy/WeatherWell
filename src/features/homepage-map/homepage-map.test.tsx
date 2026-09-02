import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomepageMap } from "./homepage-map";
import { MOCK_ZONES } from "@/lib/mock-data";

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
});
