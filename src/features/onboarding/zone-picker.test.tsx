import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZonePicker } from "./zone-picker";
import { FIXTURE_REFERENCE_DATA, renderWithData } from "@/test-utils/render-with-data";

const ZONES = FIXTURE_REFERENCE_DATA.zones;

function stubGeolocation(value: unknown) {
  Object.defineProperty(global.navigator, "geolocation", {
    value,
    configurable: true,
  });
}

function stubFix(latitude: number, longitude: number, accuracy = 30) {
  const getCurrentPosition = vi.fn((success: PositionCallback) => {
    success({ coords: { latitude, longitude, accuracy } } as GeolocationPosition);
  });
  stubGeolocation({ getCurrentPosition });
  return getCurrentPosition;
}

function radioFor(zoneId: string) {
  return screen.getByRole("radio", { name: ZONES.find((z) => z.id === zoneId)!.name });
}

describe("ZonePicker", () => {
  beforeEach(() => {
    stubGeolocation(undefined);
  });

  it("lists every zone by name", () => {
    renderWithData(<ZonePicker zones={ZONES} onSelect={() => {}} />);
    for (const zone of ZONES) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("disables confirm until a zone is chosen", () => {
    renderWithData(<ZonePicker zones={ZONES} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("calls onSelect with a non-default zone the user picked", async () => {
    const onSelect = vi.fn();
    renderWithData(<ZonePicker zones={ZONES} onSelect={onSelect} />);

    // Deliberately the second zone: proves the choice is read, not defaulted.
    await userEvent.click(screen.getByText(ZONES[1].name));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onSelect).toHaveBeenCalledWith(ZONES[1].id);
  });

  it("offers the CLOSEST covered barangay with its distance, not the first in the list, and waits for confirmation", async () => {
    // ~1.1 km north of zone-2 (Mangaldan). zone-1 is first in the list.
    const getCurrentPosition = stubFix(16.08, 120.4038);
    const onSelect = vi.fn();
    renderWithData(<ZonePicker zones={ZONES} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(getCurrentPosition).toHaveBeenCalled();
    expect(
      await screen.findByText(/Closest barangay we cover: Barangay Poblacion, Mangaldan, about 1\.1 km away/)
    ).toBeInTheDocument();
    expect(radioFor("zone-2")).toBeChecked();
    expect(radioFor("zone-1")).not.toBeChecked();
    // Offered, never assumed: nothing is saved until the resident confirms.
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByText(/approximate/i)).not.toBeInTheDocument();
  });

  it("says plainly when the resident is outside every covered barangay, and selects nothing", async () => {
    stubFix(14.5995, 120.9842); // Manila
    renderWithData(<ZonePicker zones={ZONES} onSelect={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(
      await screen.findByText(/You're about \d+ km from the nearest barangay WeatherWell covers\. We don't cover your area yet/)
    ).toBeInTheDocument();
    for (const zone of ZONES) expect(radioFor(zone.id)).not.toBeChecked();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    expect(screen.queryByText(/Closest barangay we cover/)).not.toBeInTheDocument();
  });

  it("clears a barangay the location proposed when a later fix turns out to be outside coverage", async () => {
    stubFix(16.08, 120.4038); // near zone-2
    renderWithData(<ZonePicker zones={ZONES} onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));
    await screen.findByText(/Closest barangay we cover/);
    expect(radioFor("zone-2")).toBeChecked();

    stubFix(7.19, 125.45); // Davao
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));
    await screen.findByText(/We don't cover your area yet/);
    for (const zone of ZONES) expect(radioFor(zone.id)).not.toBeChecked();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("keeps a barangay the resident picked by hand when a fix is outside coverage", async () => {
    renderWithData(<ZonePicker zones={ZONES} onSelect={() => {}} />);
    await userEvent.click(screen.getByText(ZONES[2].name));

    stubFix(7.19, 125.45); // Davao
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));
    await screen.findByText(/We don't cover your area yet/);
    expect(radioFor(ZONES[2].id)).toBeChecked();
  });

  it("labels an imprecise fix as approximate", async () => {
    stubFix(16.08, 120.4038, 2500);
    renderWithData(<ZonePicker zones={ZONES} onSelect={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(await screen.findByText(/Your location is approximate/)).toBeInTheDocument();
  });

  it("falls back to the manual list when geolocation is denied", async () => {
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({ code: 1, message: "denied" } as GeolocationPositionError);
      }
    );
    stubGeolocation({ getCurrentPosition });

    renderWithData(<ZonePicker zones={ZONES} onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(await screen.findByText(/Couldn't get your location/)).toBeInTheDocument();
    for (const zone of ZONES) expect(radioFor(zone.id)).not.toBeChecked();
  });

  it("reports failure when the device has no geolocation API at all", async () => {
    renderWithData(<ZonePicker zones={ZONES} onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));
    expect(await screen.findByText(/Couldn't get your location/)).toBeInTheDocument();
  });

  it("speaks Filipino, including the distance message", async () => {
    stubFix(16.08, 120.4038);
    renderWithData(<ZonePicker zones={ZONES} onSelect={() => {}} />, { lang: "fil" });

    await userEvent.click(screen.getByRole("button", { name: "Gamitin ang aking lokasyon" }));

    expect(
      await screen.findByText(/Pinakamalapit na barangay na sakop ng WeatherWell: Barangay Poblacion, Mangaldan, mga 1\.1 km ang layo/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kumpirmahin ang barangay" })).toBeInTheDocument();
  });
});
