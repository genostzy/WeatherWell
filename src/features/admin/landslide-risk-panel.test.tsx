import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LandslideRiskPanel } from "./landslide-risk-panel";
import { MOCK_ZONES } from "@/lib/mock-data";

describe("LandslideRiskPanel", () => {
  it("shows every zone's baseline susceptibility", () => {
    render(<LandslideRiskPanel zones={MOCK_ZONES} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("reads Normal rather than fabricating an elevated risk the mock data doesn't have", () => {
    // Every mock zone is currently "low" landslide susceptibility, so
    // hasElevatedLandslideRisk can never fire for them — this panel must
    // not invent an "Elevated now" badge where the data says otherwise.
    render(<LandslideRiskPanel zones={MOCK_ZONES} />);
    expect(screen.getAllByText("Normal")).toHaveLength(MOCK_ZONES.length);
    expect(screen.queryByText(/elevated now/i)).not.toBeInTheDocument();
  });
});
