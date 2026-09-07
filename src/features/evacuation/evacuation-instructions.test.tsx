import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvacuationInstructions } from "./evacuation-instructions";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

const zone = FIXTURE_REFERENCE_DATA.zones[0];

describe("EvacuationInstructions", () => {
  it("shows the evacuation center name and route text", () => {
    render(<EvacuationInstructions zone={zone} />);
    expect(screen.getByText(zone.evacuationCenterName)).toBeInTheDocument();
    expect(screen.getByText(zone.evacuationRouteText.en)).toBeInTheDocument();
  });

  it("pairs each instruction with a pictogram cue, never text alone", () => {
    const { container } = render(<EvacuationInstructions zone={zone} />);
    expect(
      container.querySelector('[data-testid="icon-evacuation-center"]')
    ).toBeInTheDocument();
    expect(container.querySelector('[data-testid="icon-route"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="icon-hotline"]')).toBeInTheDocument();
  });

  it("marks decorative icons hidden from screen readers", () => {
    const { container } = render(<EvacuationInstructions zone={zone} />);
    const icon = container.querySelector('[data-testid="icon-route"]');
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("offers a direct call link to the zone hotline", () => {
    render(<EvacuationInstructions zone={zone} />);
    expect(screen.getByRole("link", { name: /call/i })).toHaveAttribute(
      "href",
      `tel:${zone.hotlineNumber}`
    );
  });
});
