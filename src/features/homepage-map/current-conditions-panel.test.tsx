import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CurrentConditionsPanel } from "./current-conditions-panel";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

const LIVE = {
  rainfall_mm: 16,
  wind_kph: 12,
  temperature_c: 27,
  apparent_temperature_c: 34,
  humidity_pct: 90,
  weather_code: 61,
  fetched_at: "2026-09-23T11:00:00.000Z",
};
let liveReading: typeof LIVE | null = LIVE;
let river: object | null = null;
vi.mock("@/lib/use-weather-data", () => ({
  useWeatherData: () => ({ current: liveReading, rainfallHistory: [], rainfallForecast: [], river, isLoading: false, error: null }),
}));

vi.mock("@/lib/use-typhoon", () => ({
  useTyphoon: vi.fn(() => ({
    track: null,
    isLoading: false,
    error: null,
  })),
}));

describe("CurrentConditionsPanel", () => {
  it("is collapsed by default, showing only a compact rainfall/wind summary", () => {
    renderWithData(<CurrentConditionsPanel zone={FIXTURE_REFERENCE_DATA.zones[0]} />);
    expect(screen.queryByText(/typhoon track/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /current conditions/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("reveals live rainfall, wind, typhoon and feels-like temperature on expand", async () => {
    liveReading = LIVE;
    const user = userEvent.setup();
    renderWithData(<CurrentConditionsPanel zone={FIXTURE_REFERENCE_DATA.zones[0]} />);

    await user.click(screen.getByRole("button", { name: /current conditions/i }));

    expect(screen.getByText("Typhoon track")).toBeInTheDocument();
    expect(screen.getByText("16 mm/hr")).toBeInTheDocument();
    expect(screen.getByText("12 km/h")).toBeInTheDocument();
    expect(screen.getByText(/34°C/)).toBeInTheDocument();
    // There is no free source for PAGASA's drought outlook; the mock text is gone.
    expect(screen.queryByText(/drought/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /current conditions/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("shows a thunderstorm watch note only for a zone under watch", async () => {
    const user = userEvent.setup();
    renderWithData(<CurrentConditionsPanel zone={FIXTURE_REFERENCE_DATA.zones[2]} />);
    await user.click(screen.getByRole("button", { name: /current conditions/i }));
    expect(screen.queryByText(/thunderstorm watch/i)).not.toBeInTheDocument();
  });
});

describe("CurrentConditionsPanel with no live reading", () => {
  it("shows a dash, never a made-up zero", async () => {
    liveReading = null;
    const user = userEvent.setup();
    renderWithData(<CurrentConditionsPanel zone={FIXTURE_REFERENCE_DATA.zones[0]} />);
    await user.click(screen.getByRole("button", { name: /current conditions/i }));
    expect(screen.queryByText("0 mm/hr")).not.toBeInTheDocument();
    expect(screen.getByText(/no live weather reading right now/i)).toBeInTheDocument();
    liveReading = LIVE;
  });
});

describe("CurrentConditionsPanel with no hazard data (I3)", () => {
  it("renders, and raises no landslide caution from missing data under heavy rain", async () => {
    const user = userEvent.setup();
    renderWithData(<CurrentConditionsPanel zone={FIXTURE_REFERENCE_DATA.zones[1]} />, { data: { hazards: {} } });
    await user.click(screen.getByRole("button", { name: /current conditions/i }));

    expect(screen.getByText("Typhoon track")).toBeInTheDocument();
    expect(screen.queryByText(/landslide-prone/i)).not.toBeInTheDocument();
  });
});

describe("CurrentConditionsPanel river outlook (idea 1)", () => {
  it("shows the week's river outlook and flags a rising river", async () => {
    river = { trend: "rising", todayM3s: 50, peakM3s: 95, peakDate: "2026-09-25", worstM3s: 140 };
    const user = userEvent.setup();
    renderWithData(<CurrentConditionsPanel zone={FIXTURE_REFERENCE_DATA.zones[0]} />);
    await user.click(screen.getByRole("button", { name: /current conditions/i }));
    expect(screen.getByText(/river, next 7 days/i)).toBeInTheDocument();
    expect(screen.getByText(/rising: up to 95 m³\/s/i)).toBeInTheDocument();
    river = null;
  });

  it("leaves the row out where there is no river forecast", async () => {
    river = null;
    const user = userEvent.setup();
    renderWithData(<CurrentConditionsPanel zone={FIXTURE_REFERENCE_DATA.zones[0]} />);
    await user.click(screen.getByRole("button", { name: /current conditions/i }));
    expect(screen.queryByText(/river, next 7 days/i)).not.toBeInTheDocument();
  });
});
