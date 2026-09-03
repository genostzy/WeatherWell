import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CurrentConditionsPanel } from "./current-conditions-panel";
import { MOCK_ZONES } from "@/lib/mock-data";

describe("CurrentConditionsPanel", () => {
  it("is collapsed by default, showing only a compact rainfall/wind summary", () => {
    render(<CurrentConditionsPanel zone={MOCK_ZONES[0]} />);
    expect(screen.queryByText(/typhoon track/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /current conditions/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("reveals rainfall, wind, typhoon, heat index, and drought outlook on expand", async () => {
    const user = userEvent.setup();
    render(<CurrentConditionsPanel zone={MOCK_ZONES[0]} />);

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
    render(<CurrentConditionsPanel zone={MOCK_ZONES[2]} />);
    await user.click(screen.getByRole("button", { name: /current conditions/i }));
    expect(screen.queryByText(/thunderstorm watch/i)).not.toBeInTheDocument();
  });
});
