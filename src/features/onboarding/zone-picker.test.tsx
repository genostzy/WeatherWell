import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZonePicker } from "./zone-picker";
import { FIXTURE_REFERENCE_DATA, renderWithData } from "@/test-utils/render-with-data";
import { mockZoneApis } from "@/test-utils/mock-zone-apis";

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

async function searchAndSelect(query: string, zoneName: string) {
  const input = screen.getByRole("textbox", { name: /search barangay/i });
  await userEvent.clear(input);
  await userEvent.type(input, query);
  // Wait for results to render — the option now contains zone name + municipality/province,
  // so use getByText which matches partial text content.
  const result = await screen.findByText(zoneName);
  const button = result.closest("[role='option']") as HTMLElement;
  // Prevent blur from hiding results before click
  fireEvent.mouseDown(button);
}

describe("ZonePicker", () => {
  beforeEach(() => {
    stubGeolocation(undefined);
    mockZoneApis(ZONES);
  });

  it("starts with confirm disabled and no selected zone", () => {
    renderWithData(<ZonePicker onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
  });

  it("searches and selects a zone by name", async () => {
    const onSelect = vi.fn();
    renderWithData(<ZonePicker onSelect={onSelect} />);

    await searchAndSelect("Nilombot", "Barangay Nilombot, Mapandan");

    // Zone should now be shown as selected
    expect(screen.getByText("Barangay Nilombot, Mapandan")).toBeInTheDocument();
    expect(screen.getByText(/Selected:/)).toBeInTheDocument();

    // Confirm should be enabled
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onSelect).toHaveBeenCalledWith(ZONES[0].id);
  });

  it("searches by municipality name", async () => {
    renderWithData(<ZonePicker onSelect={() => {}} />);

    const input = screen.getByRole("textbox", { name: /search barangay/i });
    await userEvent.type(input, "Mangaldan");

    // Should show zones in Mangaldan
    const result = await screen.findByText("Barangay Poblacion, Mangaldan");
    expect(result.closest("[role='option']")).toBeInTheDocument();
  });

  it("shows no-results message for unmatched search", async () => {
    renderWithData(<ZonePicker onSelect={() => {}} />);

    const input = screen.getByRole("textbox", { name: /search barangay/i });
    await userEvent.type(input, "zzzznonexistent");

    expect(await screen.findByText(/No barangays match/)).toBeInTheDocument();
  });

  it("offers the CLOSEST covered barangay with its distance, not the first in the list, and waits for confirmation", async () => {
    // ~1.1 km north of zone-2 (Mangaldan). zone-1 is first in the list.
    const getCurrentPosition = stubFix(16.08, 120.4038);
    const onSelect = vi.fn();
    renderWithData(<ZonePicker onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(getCurrentPosition).toHaveBeenCalled();
    expect(
      await screen.findByText(/Closest barangay we cover: Barangay Poblacion, Mangaldan, about 1\.1 km away/)
    ).toBeInTheDocument();
    // Zone is shown as selected
    expect(screen.getByText("Barangay Poblacion, Mangaldan")).toBeInTheDocument();
    // Offered, never assumed: nothing is saved until the resident confirms.
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByText(/approximate/i)).not.toBeInTheDocument();
  });

  it("says plainly when the resident is outside every covered barangay, and selects nothing", async () => {
    stubFix(14.5995, 120.9842); // Manila
    renderWithData(<ZonePicker onSelect={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(
      await screen.findByText(/You're about \d+ km from the nearest barangay WeatherWell covers\. We don't cover your area yet/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
    expect(screen.queryByText(/Closest barangay we cover/)).not.toBeInTheDocument();
  });

  it("clears a barangay the location proposed when a later fix turns out to be outside coverage", async () => {
    stubFix(16.08, 120.4038); // near zone-2
    renderWithData(<ZonePicker onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));
    await screen.findByText(/Closest barangay we cover/);
    expect(screen.getByText("Barangay Poblacion, Mangaldan")).toBeInTheDocument();

    stubFix(7.19, 125.45); // Davao
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));
    await screen.findByText(/We don't cover your area yet/);
    expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("keeps a barangay the resident picked by hand when a fix is outside coverage", async () => {
    renderWithData(<ZonePicker onSelect={() => {}} />);

    // Search and select zone-2 manually
    await searchAndSelect("Poblacion, Mangaldan", "Barangay Poblacion, Mangaldan");

    stubFix(7.19, 125.45); // Davao
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));
    await screen.findByText(/We don't cover your area yet/);
    // Manual selection should persist
    expect(screen.getByText("Barangay Poblacion, Mangaldan")).toBeInTheDocument();
  });

  it("labels an imprecise fix as approximate", async () => {
    stubFix(16.08, 120.4038, 2500);
    renderWithData(<ZonePicker onSelect={() => {}} />);

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

    renderWithData(<ZonePicker onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    expect(await screen.findByText(/Couldn't get your location/)).toBeInTheDocument();
    expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
  });

  describe("a location read that never answers (Minor 7)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("asks the device for a bounded read: a timeout, and a recent cached fix is fine", () => {
      const getCurrentPosition = vi.fn();
      stubGeolocation({ getCurrentPosition });
      renderWithData(<ZonePicker onSelect={() => {}} />);

      fireEvent.click(screen.getByRole("button", { name: /use my location/i }));

      expect(getCurrentPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({ timeout: 15_000, maximumAge: 60_000 })
      );
    });

    it("ends in the couldn't-get-your-location state and re-enables the button, even if the device never calls back", () => {
      vi.useFakeTimers();
      // Some devices never settle the call at all (indoors, no GPS), timeout
      // option or not.
      const getCurrentPosition = vi.fn();
      stubGeolocation({ getCurrentPosition });
      renderWithData(<ZonePicker onSelect={() => {}} />);
      const button = screen.getByRole("button", { name: /use my location/i });

      fireEvent.click(button);
      expect(screen.getByText(/Finding your location/)).toBeInTheDocument();
      expect(button).toBeDisabled();

      // The device's own 15-second timeout only starts once the permission
      // prompt is answered, so the screen allows longer before giving up.
      act(() => {
        vi.advanceTimersByTime(29_999);
      });
      expect(button).toBeDisabled();

      act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(screen.getByText(/Couldn't get your location/)).toBeInTheDocument();
      expect(button).toBeEnabled();
      expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();

      // And it can be tried again.
      fireEvent.click(button);
      expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    });

    it("ignores a fix that finally arrives after the read was given up on", () => {
      vi.useFakeTimers();
      let lateSuccess: PositionCallback | undefined;
      const getCurrentPosition = vi.fn((success: PositionCallback) => {
        lateSuccess = success;
      });
      stubGeolocation({ getCurrentPosition });
      renderWithData(<ZonePicker onSelect={() => {}} />);

      fireEvent.click(screen.getByRole("button", { name: /use my location/i }));
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      act(() => {
        lateSuccess?.({ coords: { latitude: 16.08, longitude: 120.4038, accuracy: 30 } } as GeolocationPosition);
      });

      expect(screen.getByText(/Couldn't get your location/)).toBeInTheDocument();
      expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
    });
  });

  it("reports failure when the device has no geolocation API at all", async () => {
    renderWithData(<ZonePicker onSelect={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));
    expect(await screen.findByText(/Couldn't get your location/)).toBeInTheDocument();
  });

  it("speaks Filipino, including the distance message", async () => {
    stubFix(16.08, 120.4038);
    renderWithData(<ZonePicker onSelect={() => {}} />, { lang: "fil" });

    await userEvent.click(screen.getByRole("button", { name: "Gamitin ang aking lokasyon" }));

    expect(
      await screen.findByText(/Pinakamalapit na barangay na sakop ng WeatherWell: Barangay Poblacion, Mangaldan, mga 1\.1 km ang layo/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kumpirmahin ang barangay" })).toBeInTheDocument();
  });
});
