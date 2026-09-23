import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ElevationCheck } from "./elevation-check";

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
    expect(fetchMock.mock.calls[0][0]).toBe("/api/elevation?zoneId=zone-1&lat=16.029&lng=120.431");
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

  it("says so when the service is down", async () => {
    stubPosition(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    render(<ElevationCheck zoneId="zone-1" />);
    fireEvent.click(screen.getByRole("button", { name: /how high am i/i }));
    expect(await screen.findByText(/couldn't check the height/i)).toBeInTheDocument();
  });
});
