import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { GeofenceAlertBanner } from "./geofence-alert-banner";
import { useGeofenceAlert } from "./use-geofence-alert";
import { FIXTURE_REFERENCE_DATA, renderWithData } from "@/test-utils/render-with-data";
import type { AlertRecord } from "@/lib/types";

const zones = FIXTURE_REFERENCE_DATA.zones;
const [zone] = zones;
const warning: AlertRecord = {
  id: "a-warning",
  zoneId: zone.id,
  severity: "red",
  message: { en: "Move now", fil: "Lumikas na" },
  source: "manual",
  confidence: "validated",
  issuedAt: new Date().toISOString(),
  isActive: true,
};

/** The hook and the banner as the home screen wires them. */
function Harness({ position }: { position: { lat: number; lng: number } }) {
  const { alert } = useGeofenceAlert(zones, position);
  return alert ? <GeofenceAlertBanner severity={alert.severity} message={alert.message} onDismiss={() => {}} /> : null;
}

describe("the danger banner near a barangay under a Warning", () => {
  it("speaks Filipino when the app does", async () => {
    renderWithData(<Harness position={{ lat: zone.lat, lng: zone.lng }} />, { lang: "fil", alerts: [warning] });
    const line = await screen.findByText(`Malapit ka sa ${zone.name}. Pumunta sa mas mataas na lugar.`);
    expect(line).toHaveAttribute("lang", "fil");
  });

  it("and English when the app does", async () => {
    renderWithData(<Harness position={{ lat: zone.lat, lng: zone.lng }} />, { lang: "en", alerts: [warning] });
    expect(await screen.findByText(`You are near ${zone.name}. Move to higher ground.`)).toBeInTheDocument();
  });
});
