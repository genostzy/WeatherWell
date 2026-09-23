import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
