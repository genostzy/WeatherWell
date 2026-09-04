import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZoneMap } from "./zone-map";
import { MOCK_ZONES } from "@/lib/mock-data";

describe("ZoneMap", () => {
  it("renders a labeled region for every zone", () => {
    render(<ZoneMap zones={MOCK_ZONES} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("renders one region per zone, not a single merged block", () => {
    const { container } = render(<ZoneMap zones={MOCK_ZONES} />);
    expect(container.querySelectorAll('[data-testid="zone-region"]')).toHaveLength(
      MOCK_ZONES.length
    );
  });

  it("is honest that real boundary data is not wired yet", () => {
    render(<ZoneMap zones={MOCK_ZONES} />);
    expect(screen.getByText(/phase 2/i)).toBeInTheDocument();
  });

  it("gives each zone its live conditions, baseline risk, and evacuation center", () => {
    render(<ZoneMap zones={MOCK_ZONES} />);
    expect(screen.getAllByText(/mm\/hr/).length).toBe(MOCK_ZONES.length);
    expect(screen.getAllByText(/flood:/i).length).toBe(MOCK_ZONES.length);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(zone.evacuationCenterName)).toBeInTheDocument();
    }
  });

  it("offers a callable hotline for every zone", () => {
    render(<ZoneMap zones={MOCK_ZONES} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByRole("link", { name: zone.hotlineNumber })).toHaveAttribute(
        "href",
        `tel:${zone.hotlineNumber}`
      );
    }
  });

  it("filters the list down to one status, and back again", async () => {
    const user = userEvent.setup();
    const { container } = render(<ZoneMap zones={MOCK_ZONES} />);

    // zone-2 and zone-3 both carry "evacuate" mock alerts (waist- and neck-deep
    // reports respectively), so Hazardous shows two zones.
    await user.click(screen.getByRole("button", { name: /hazardous \(2\)/i }));
    expect(container.querySelectorAll('[data-testid="zone-region"]')).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /^all/i }));
    expect(container.querySelectorAll('[data-testid="zone-region"]')).toHaveLength(
      MOCK_ZONES.length
    );
  });

  it("disables a status filter no zone currently matches", () => {
    // Every mock zone carries an active alert, so none are Safe.
    render(<ZoneMap zones={MOCK_ZONES} />);
    expect(screen.getByRole("button", { name: /safe \(0\)/i })).toBeDisabled();
  });
});
