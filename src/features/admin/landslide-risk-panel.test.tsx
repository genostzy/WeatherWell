import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { LandslideRiskPanel } from "./landslide-risk-panel";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

let rainfallMm: number | null = 0;
vi.mock("@/lib/use-weather-data", () => ({
  useWeatherData: () => ({
    current: rainfallMm === null ? null : { rainfall_mm: rainfallMm },
    rainfallHistory: [],
    rainfallForecast: [],
    isLoading: false,
    error: null,
  }),
}));

describe("LandslideRiskPanel", () => {
  it("shows every zone's baseline susceptibility", () => {
    renderWithData(<LandslideRiskPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("raises Elevated now from the live rainfall reading on susceptible terrain", () => {
    rainfallMm = 20;
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    const hazards = { [zone.id]: { flood: "high", landslide: "high", storm_surge: "low", dam_release: "low" } } as const;
    renderWithData(<LandslideRiskPanel zones={[zone]} />, { data: { hazards } });
    expect(screen.getByText(/elevated now/i)).toBeInTheDocument();
    rainfallMm = 0;
  });

  it("stays Normal with no live reading, never guessing", () => {
    rainfallMm = null;
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    const hazards = { [zone.id]: { flood: "high", landslide: "high", storm_surge: "low", dam_release: "low" } } as const;
    renderWithData(<LandslideRiskPanel zones={[zone]} />, { data: { hazards } });
    expect(screen.queryByText(/elevated now/i)).not.toBeInTheDocument();
    rainfallMm = 0;
  });

  it("reads Normal rather than fabricating an elevated risk the mock data doesn't have", () => {
    // Every mock zone is currently "low" landslide susceptibility, so with no
    // heavy rain hasElevatedLandslideRisk cannot fire for them — this panel must
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
