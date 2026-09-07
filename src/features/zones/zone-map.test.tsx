import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZoneMap } from "./zone-map";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { zonesWithStatus } from "@/test-utils/mock-fixtures";

describe("ZoneMap", () => {
  it("renders a labeled region for every zone", () => {
    renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("renders one region per zone, not a single merged block", () => {
    const { container } = renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(container.querySelectorAll('[data-testid="zone-region"]')).toHaveLength(
      FIXTURE_REFERENCE_DATA.zones.length
    );
  });

  it("is honest that real boundary data is not wired yet", () => {
    renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(screen.getByText(/phase 2/i)).toBeInTheDocument();
  });

  it("gives each zone its live conditions, baseline risk, and evacuation center", () => {
    renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(screen.getAllByText(/mm\/hr/).length).toBe(FIXTURE_REFERENCE_DATA.zones.length);
    expect(screen.getAllByText(/flood:/i).length).toBe(FIXTURE_REFERENCE_DATA.zones.length);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.evacuationCenterName)).toBeInTheDocument();
    }
  });

  it("offers a callable hotline for every zone", () => {
    renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByRole("link", { name: zone.hotlineNumber })).toHaveAttribute(
        "href",
        `tel:${zone.hotlineNumber}`
      );
    }
  });

  it("filters the list down to one status, and back again", async () => {
    const user = userEvent.setup();
    const { container } = renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);

    // Derived from the fixtures rather than hardcoded, so rebalancing which
    // zones carry an "evacuate" alert doesn't break this test.
    const hazardousCount = zonesWithStatus("hazardous").length;
    expect(hazardousCount).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: new RegExp(`hazardous \\(${hazardousCount}\\)`, "i") }));
    expect(container.querySelectorAll('[data-testid="zone-region"]')).toHaveLength(hazardousCount);

    await user.click(screen.getByRole("button", { name: /^all/i }));
    expect(container.querySelectorAll('[data-testid="zone-region"]')).toHaveLength(
      FIXTURE_REFERENCE_DATA.zones.length
    );
  });

  it("disables a status filter no zone currently matches", () => {
    // Every mock zone carries an active alert, so none are Safe.
    renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(screen.getByRole("button", { name: /safe \(0\)/i })).toBeDisabled();
  });
});
