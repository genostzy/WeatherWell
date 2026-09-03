import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvacuationManagementPanel } from "./evacuation-management-panel";
import { MOCK_ZONES } from "@/lib/mock-data";

describe("EvacuationManagementPanel", () => {
  it("summarizes capacity across zones in the donut's center label", () => {
    // 3 of the 4 mock zones default to space_available.
    render(<EvacuationManagementPanel zones={MOCK_ZONES} />);
    expect(screen.getByText("3/4")).toBeInTheDocument();
  });

  it("lists every zone's evacuation center and a callable hotline", () => {
    render(<EvacuationManagementPanel zones={MOCK_ZONES} />);
    for (const zone of MOCK_ZONES) {
      expect(screen.getByText(zone.evacuationCenterName)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: zone.hotlineNumber })).toHaveAttribute(
        "href",
        `tel:${zone.hotlineNumber}`
      );
    }
  });

  it("changing a zone's capacity here updates its badge immediately", async () => {
    const user = userEvent.setup();
    render(<EvacuationManagementPanel zones={MOCK_ZONES} />);

    const select = screen.getByRole("combobox", {
      name: new RegExp(`Capacity — ${MOCK_ZONES[0].name}`),
    });
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Full" }));

    // The donut's summary should now reflect one fewer zone with space.
    expect(screen.getByText("2/4")).toBeInTheDocument();
  });
});
