import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

const confirmMock = vi.fn();
vi.mock("@/app/actions/confirm-evacuation-center", () => ({
  confirmEvacuationCenter: (...args: unknown[]) => confirmMock(...args),
}));

import { PlaceCentreOnMap } from "./place-centre-on-map";

const zone = FIXTURE_REFERENCE_DATA.zones[0];
// A placeholder centre sits on the barangay's own point, with nothing to prefill.
const placeholder = { ...zone, evacuationCenterLat: zone.lat, evacuationCenterLng: zone.lng, evacuationCenterCapacity: 0 };

beforeEach(() => {
  confirmMock.mockReset();
  confirmMock.mockResolvedValue({ ok: true });
});

describe("PlaceCentreOnMap", () => {
  it("saves the spot placed at the map's centre, with a name and capacity", async () => {
    const user = userEvent.setup();
    renderWithData(<PlaceCentreOnMap zone={placeholder} />);
    await user.click(screen.getByRole("button", { name: "Place at the map's centre" }));
    await user.type(screen.getByLabelText("Centre name"), "Nilombot Covered Court");
    await user.type(screen.getByLabelText("Capacity (people)"), "250");
    await user.click(screen.getByRole("button", { name: "Save centre" }));

    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith({
        zoneId: placeholder.id,
        name: "Nilombot Covered Court",
        lat: placeholder.evacuationCenterLat,
        lng: placeholder.evacuationCenterLng,
        capacity: 250,
      })
    );
    expect(await screen.findByText("Saved — residents will see it the next time their app loads.")).toBeInTheDocument();
  });

  it("keeps Save off until a spot and a name are set", async () => {
    const user = userEvent.setup();
    renderWithData(<PlaceCentreOnMap zone={placeholder} />);
    const save = screen.getByRole("button", { name: "Save centre" });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Centre name"), "Covered Court");
    expect(save).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Place at the map's centre" }));
    expect(save).toBeEnabled();
  });

  it("tells the official in their language when the spot is over 5 km away", async () => {
    confirmMock.mockResolvedValue({ ok: false, permanent: true, error: "centre must be within 5 km of the barangay" });
    const user = userEvent.setup();
    renderWithData(<PlaceCentreOnMap zone={placeholder} />, { lang: "fil" });
    await user.click(screen.getByRole("button", { name: "Ilagay sa gitna ng mapa" }));
    await user.type(screen.getByLabelText("Pangalan ng center"), "Malayong Paaralan");
    await user.click(screen.getByRole("button", { name: "I-save ang center" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Dapat nasa loob ng 5 km mula sa barangay ang center.");
  });
});
