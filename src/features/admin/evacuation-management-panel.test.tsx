import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvacuationManagementPanel } from "./evacuation-management-panel";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

describe("EvacuationManagementPanel", () => {
  it("summarizes capacity across zones in the donut's center label", () => {
    // 3 of the 4 mock zones default to space_available.
    render(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(screen.getByText("3/4")).toBeInTheDocument();
  });

  it("lists every zone's evacuation center and a callable hotline", () => {
    render(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.evacuationCenterName)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: zone.hotlineNumber })).toHaveAttribute(
        "href",
        `tel:${zone.hotlineNumber}`
      );
    }
  });

  it("changing a zone's capacity here updates its badge immediately", async () => {
    const user = userEvent.setup();
    render(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);

    const select = screen.getByRole("combobox", {
      name: new RegExp(`Capacity — ${FIXTURE_REFERENCE_DATA.zones[0].name}`),
    });
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Full" }));

    // The donut's summary should now reflect one fewer zone with space.
    expect(screen.getByText("2/4")).toBeInTheDocument();
  });
});
