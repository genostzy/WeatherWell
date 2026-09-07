import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZonePicker } from "./zone-picker";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

function stubGeolocation(value: unknown) {
  Object.defineProperty(global.navigator, "geolocation", {
    value,
    configurable: true,
  });
}

describe("ZonePicker", () => {
  beforeEach(() => {
    stubGeolocation(undefined);
  });

  it("lists every zone by name", () => {
    render(<ZonePicker zones={FIXTURE_REFERENCE_DATA.zones} onSelect={() => {}} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("disables confirm until a zone is chosen", () => {
    render(<ZonePicker zones={FIXTURE_REFERENCE_DATA.zones} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("calls onSelect with a non-default zone the user picked", async () => {
    const onSelect = vi.fn();
    render(<ZonePicker zones={FIXTURE_REFERENCE_DATA.zones} onSelect={onSelect} />);

    // Deliberately the second zone: proves the choice is read, not defaulted.
    await userEvent.click(screen.getByText(FIXTURE_REFERENCE_DATA.zones[1].name));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onSelect).toHaveBeenCalledWith(FIXTURE_REFERENCE_DATA.zones[1].id);
  });

  it("auto-detects a zone via geolocation when permission is granted", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 14.6, longitude: 121.0 } } as GeolocationPosition);
    });
    stubGeolocation({ getCurrentPosition });

    render(<ZonePicker zones={FIXTURE_REFERENCE_DATA.zones} onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(getCurrentPosition).toHaveBeenCalled();
    expect(await screen.findByText(/detected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeEnabled();
  });

  it("falls back to the manual list when geolocation is denied", async () => {
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({ code: 1, message: "denied" } as GeolocationPositionError);
      }
    );
    stubGeolocation({ getCurrentPosition });

    render(<ZonePicker zones={FIXTURE_REFERENCE_DATA.zones} onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(await screen.findByText(/couldn.t detect/i)).toBeInTheDocument();
    expect(screen.getByText(FIXTURE_REFERENCE_DATA.zones[0].name)).toBeInTheDocument();
  });

  it("reports failure when the device has no geolocation API at all", async () => {
    render(<ZonePicker zones={FIXTURE_REFERENCE_DATA.zones} onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));
    expect(await screen.findByText(/couldn.t detect/i)).toBeInTheDocument();
  });
});
