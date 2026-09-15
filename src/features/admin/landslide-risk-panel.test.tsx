import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { LandslideRiskPanel } from "./landslide-risk-panel";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

describe("LandslideRiskPanel", () => {
  it("shows every zone's baseline susceptibility", () => {
    renderWithData(<LandslideRiskPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("reads Normal rather than fabricating an elevated risk the mock data doesn't have", () => {
    // Every mock zone is currently "low" landslide susceptibility, so
    // hasElevatedLandslideRisk can never fire for them — this panel must
    // not invent an "Elevated now" badge where the data says otherwise.
    renderWithData(<LandslideRiskPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(screen.getAllByText("Normal")).toHaveLength(FIXTURE_REFERENCE_DATA.zones.length);
    expect(screen.queryByText(/elevated now/i)).not.toBeInTheDocument();
  });
});

describe("LandslideRiskPanel with no hazard data (I3)", () => {
  it("renders Unknown, and never Elevated now, for zones with no hazard rows", () => {
    renderWithData(<LandslideRiskPanel zones={FIXTURE_REFERENCE_DATA.zones} />, { data: { hazards: {} } });

    expect(screen.getAllByText("Unknown")).toHaveLength(FIXTURE_REFERENCE_DATA.zones.length);
    expect(screen.queryByText(/elevated now/i)).not.toBeInTheDocument();
  });
});
