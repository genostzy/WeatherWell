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

describe("EmergencyCard: every number the barangay lists", () => {
  const listed = { ...zone, hotlineNumber: "0917 123 4567", extraHotlines: ["(075) 522-1234"] };
  const steps = "1. Take the river road.\n2. Cross at the bridge.";

  it("lists every hotline number", () => {
    render(<EmergencyCard zone={listed} />);
    expect(screen.getByText("0917 123 4567")).toBeInTheDocument();
    expect(screen.getByText("(075) 522-1234")).toBeInTheDocument();
  });

  it("keeps the official's line breaks", () => {
    render(<EmergencyCard zone={{ ...listed, evacuationRouteText: { en: steps, fil: steps } }} />);
    expect(screen.getByText(/take the river road/i)).toHaveClass("whitespace-pre-line");
  });
});

describe("EmergencyCard: instructions in one language", () => {
  it("marks instructions written only in Filipino as Filipino on an English card", () => {
    render(<EmergencyCard zone={{ ...zone, evacuationRouteText: { en: "", fil: "Pumunta sa kapilya." } }} />);
    expect(screen.getByText("Pumunta sa kapilya.")).toHaveAttribute("lang", "fil");
  });
});
