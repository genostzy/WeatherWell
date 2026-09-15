import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CurrentConditionsPanel } from "./current-conditions-panel";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

describe("CurrentConditionsPanel", () => {
  it("is collapsed by default, showing only a compact rainfall/wind summary", () => {
    renderWithData(<CurrentConditionsPanel zone={FIXTURE_REFERENCE_DATA.zones[0]} />);
    expect(screen.queryByText(/typhoon track/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /current conditions/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("reveals rainfall, wind, typhoon, heat index, and drought outlook on expand", async () => {
    const user = userEvent.setup();
    renderWithData(<CurrentConditionsPanel zone={FIXTURE_REFERENCE_DATA.zones[0]} />);

    await user.click(screen.getByRole("button", { name: /current conditions/i }));

    expect(screen.getByText("Typhoon track")).toBeInTheDocument();
    expect(screen.getByText("Heat index")).toBeInTheDocument();
    expect(screen.getByText("Drought / dry-spell outlook")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /current conditions/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("shows a thunderstorm watch note only for a zone under watch", async () => {
    const user = userEvent.setup();
    // zone-1 and zone-2 are under a mock thunderstorm watch; zone-3/4 are not.
    renderWithData(<CurrentConditionsPanel zone={FIXTURE_REFERENCE_DATA.zones[2]} />);
    await user.click(screen.getByRole("button", { name: /current conditions/i }));
    expect(screen.queryByText(/thunderstorm watch/i)).not.toBeInTheDocument();
  });
});

describe("CurrentConditionsPanel with no hazard data (I3)", () => {
  it("renders, and raises no landslide caution from missing data under heavy rain", async () => {
    const user = userEvent.setup();
    // zone-2 has heavy mock rainfall (32mm/hr), so only the susceptibility
    // decides the caution. Unknown must not read as elevated.
    renderWithData(<CurrentConditionsPanel zone={FIXTURE_REFERENCE_DATA.zones[1]} />, { data: { hazards: {} } });
    await user.click(screen.getByRole("button", { name: /current conditions/i }));

    expect(screen.getByText("Typhoon track")).toBeInTheDocument();
    expect(screen.queryByText(/landslide-prone/i)).not.toBeInTheDocument();
  });
});
