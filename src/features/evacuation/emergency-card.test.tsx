import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmergencyCard } from "./emergency-card";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

const zone = FIXTURE_REFERENCE_DATA.zones[0];

describe("EmergencyCard", () => {
  it("names a real evacuation centre", () => {
    render(<EmergencyCard zone={zone} />);
    expect(screen.getByText(zone.evacuationCenterName)).toBeInTheDocument();
  });

  it("never prints the nationwide seed's placeholder centre as a place to go", () => {
    render(
      <EmergencyCard
        zone={{
          ...zone,
          evacuationCenterName: "Evacuation Centre — Santa Fe",
          evacuationCenterCapacity: 0,
          evacuationCenterLat: zone.lat,
          evacuationCenterLng: zone.lng,
        }}
      />
    );
    expect(screen.queryByText("Evacuation Centre — Santa Fe")).not.toBeInTheDocument();
    expect(screen.getByText(/no verified evacuation centre for your barangay yet/i)).toBeInTheDocument();
  });
});

describe("EmergencyCard as a printable card", () => {
  it("never prints the seed's all-zero placeholder hotline", () => {
    render(<EmergencyCard zone={{ ...zone, hotlineNumber: "00000000000" }} />);
    expect(screen.queryByText("00000000000")).not.toBeInTheDocument();
    expect(screen.getByText(/ask your barangay hall for the hotline/i)).toBeInTheDocument();
  });

  it("prints on request", () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<EmergencyCard zone={zone} />);
    fireEvent.click(screen.getByRole("button", { name: /print this card/i }));
    expect(print).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("shows a real QR code to open the app, not an empty box", async () => {
    render(<EmergencyCard zone={zone} />);
    expect(await screen.findByRole("img", { name: /qr code to open weatherwell/i })).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/png/)
    );
  });
});
