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

describe("EvacuationInstructions with the nationwide seed's placeholder centre", () => {
  const placeholder = {
    ...zone,
    evacuationCenterName: "Evacuation Centre — Santa Fe",
    evacuationCenterCapacity: 0,
    evacuationCenterLat: zone.lat,
    evacuationCenterLng: zone.lng,
  };

  it("never presents the placeholder as a real place to go", () => {
    render(<EvacuationInstructions zone={placeholder} />);
    expect(screen.queryByText("Evacuation Centre — Santa Fe")).not.toBeInTheDocument();
    expect(screen.getByText(/no verified evacuation centre for your barangay yet/i)).toBeInTheDocument();
  });

  it("shows no capacity badge for a centre that does not exist", () => {
    render(<EvacuationInstructions zone={placeholder} />);
    expect(screen.queryByText(/space available|limited|full|unknown/i)).not.toBeInTheDocument();
  });
});

describe("EvacuationInstructions without a verified hotline (found testing the live site)", () => {
  const zone = { ...FIXTURE_REFERENCE_DATA.zones[0], hotlineNumber: "00000000000" };

  it("never offers to call the placeholder, and points to 911 instead", () => {
    render(<EvacuationInstructions zone={zone} />);
    expect(document.querySelector('a[href="tel:00000000000"]')).toBeNull();
    const call = screen.getByRole("link", { name: /911/ });
    expect(call).toHaveAttribute("href", "tel:911");
    expect(call).toHaveTextContent(/national emergency/i);
  });
});
