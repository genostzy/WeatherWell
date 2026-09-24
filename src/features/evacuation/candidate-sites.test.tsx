import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const confirmMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/app/actions/confirm-evacuation-center", () => ({
  confirmEvacuationCenter: (...args: unknown[]) => confirmMock(...args),
}));

import { CandidateSites, ConfirmCentrePanel } from "./candidate-sites";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

const real = FIXTURE_REFERENCE_DATA.zones[0];
const placeholder = { ...real, evacuationCenterLat: real.lat, evacuationCenterLng: real.lng, evacuationCenterCapacity: 0 };
const SITES = [
  { name: "Nilombot Elementary School", kind: "school", lat: 16.03, lng: 120.437, distanceM: 180 },
  { name: "Barangay Hall", kind: "hall", lat: 16.031, lng: 120.438, distanceM: 420 },
];

beforeEach(() => {
  confirmMock.mockClear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => SITES }));
});
afterEach(() => vi.unstubAllGlobals());

describe("CandidateSites (idea 10)", () => {
  it("lists likely sites, clearly unconfirmed, where there is no verified centre", async () => {
    render(<CandidateSites zone={placeholder} />);
    expect(await screen.findByText("Nilombot Elementary School")).toBeInTheDocument();
    expect(screen.getByText(/not confirmed by your barangay/i)).toBeInTheDocument();
    expect(screen.getByText(/180 m/)).toBeInTheDocument();
  });

  it("stays out of the way once the barangay has a verified centre", () => {
    render(<CandidateSites zone={real} />);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/not confirmed/i)).not.toBeInTheDocument();
  });

  it("shows nothing when there are no suggestions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    const { container } = render(<CandidateSites zone={placeholder} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows a placeholder while it looks, instead of a blank space", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<CandidateSites zone={placeholder} />);
    expect(await screen.findByRole("status", { name: /looking for nearby/i })).toBeInTheDocument();
  });
});

describe("ConfirmCentrePanel (idea 10)", () => {
  it("lets an official confirm a suggestion as the barangay's centre, with a capacity", async () => {
    render(<ConfirmCentrePanel zone={placeholder} />);
    await screen.findByText("Nilombot Elementary School");
    fireEvent.change(screen.getAllByLabelText(/capacity/i)[0], { target: { value: "300" } });
    fireEvent.click(screen.getAllByRole("button", { name: /confirm as our centre/i })[0]);
    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith({
        zoneId: placeholder.id,
        name: "Nilombot Elementary School",
        lat: 16.03,
        lng: 120.437,
        capacity: 300,
      })
    );
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });
});
