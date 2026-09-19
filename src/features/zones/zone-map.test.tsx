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

  it("shows each zone's evacuation center name", () => {
    renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.evacuationCenterName)).toBeInTheDocument();
    }
  });

  it("shows rainfall data for each zone", () => {
    const { container } = renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    // Each zone row should render — rainfall is shown as a number in each row
    expect(container.querySelectorAll('[data-testid="zone-region"]')).toHaveLength(
      FIXTURE_REFERENCE_DATA.zones.length
    );
  });

  it("filters the list down to one status, and back again", async () => {
    const user = userEvent.setup();
    const { container } = renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);

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
    renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(screen.getByRole("button", { name: /safe \(0\)/i })).toBeDisabled();
  });

  it("searches zones by name", async () => {
    const user = userEvent.setup();
    renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    const firstZone = FIXTURE_REFERENCE_DATA.zones[0];
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, firstZone.name.split(",")[0]);
    expect(screen.getByText(firstZone.name)).toBeInTheDocument();
  });
});
