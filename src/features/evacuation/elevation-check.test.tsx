import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ElevationCheck } from "./elevation-check";
import { markConsented } from "@/features/onboarding/onboarding-storage";

function stubPosition(ok: boolean) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback, failure: PositionErrorCallback) =>
        ok
          ? success({ coords: { latitude: 16.029, longitude: 120.431 } } as GeolocationPosition)
          : failure({ code: 1 } as GeolocationPositionError),
    },
  });
}

describe("ElevationCheck (idea 8)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    markConsented();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "geolocation");
  });

  it("tells a resident on low ground to move early", async () => {
    stubPosition(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ here: 8, centre: 14 }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<ElevationCheck zoneId="zone-1" />);
    fireEvent.click(screen.getByRole("button", { name: /how high am i/i }));
    expect(await screen.findByText(/about 6 m lower than your barangay centre/i)).toBeInTheDocument();
    // In the body, never the address (privacy review).
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/elevation",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ zoneId: "zone-1", lat: 16.029, lng: 120.431 }) })
    );
  });

  it("says so when location is refused, without calling the service", async () => {
    stubPosition(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ElevationCheck zoneId="zone-1" />);
    fireEvent.click(screen.getByRole("button", { name: /how high am i/i }));
    expect(await screen.findByText(/needs your location/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never reads the position before the consent notice, and points to it instead (review)", async () => {
    // A shared /evacuation link opens without onboarding, and a resident set
    // up under an older notice has not accepted the current one.
    window.localStorage.clear();
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ElevationCheck zoneId="zone-1" />);
    fireEvent.click(screen.getByRole("button", { name: /how high am i/i }));
    expect(await screen.findByRole("link", { name: /how weatherwell uses your location/i })).toHaveAttribute("href", "/onboarding");
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says so when the service is down", async () => {
    stubPosition(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    render(<ElevationCheck zoneId="zone-1" />);
    fireEvent.click(screen.getByRole("button", { name: /how high am i/i }));
    expect(await screen.findByText(/couldn't check the height/i)).toBeInTheDocument();
  });
});
