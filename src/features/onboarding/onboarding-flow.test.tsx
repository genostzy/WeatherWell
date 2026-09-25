import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingPage from "@/app/onboarding/page";
import Home from "@/app/page";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { mockZoneApis } from "@/test-utils/mock-zone-apis";
import {
  ONBOARDED_KEY,
  getSelectedZoneId,
  hasOnboarded,
  markConsented,
  setSelectedZoneId,
} from "@/features/onboarding/onboarding-storage";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
}));

/**
 * Cross-page integration: the zone chosen in onboarding has to survive the
 * navigation to the home screen. Before this was wired up, every page
 * hardcoded the first zone and a user who picked another barangay saw
 * someone else's alerts.
 */
describe("onboarding → home zone threading", () => {
  beforeEach(() => {
    replace.mockClear();
    window.localStorage.clear();
    mockZoneApis(FIXTURE_REFERENCE_DATA.zones);
  });

  async function completeOnboardingWith(zoneName: string) {
    const { unmount } = renderWithData(<OnboardingPage />);
    await userEvent.click(screen.getByRole("button", { name: /i understand/i }));
    // Search for the zone by name (extract the searchable part before the comma)
    const searchTerm = zoneName.split(",")[0].replace("Barangay ", "").trim();
    const input = screen.getByRole("textbox", { name: /search barangay/i });
    await userEvent.type(input, searchTerm);
    // Wait for the result to appear in the listbox and click it
    const result = await screen.findByText(zoneName);
    const button = result.closest("[role='option']") as HTMLElement;
    fireEvent.mouseDown(button);
    // Now the zone should be selected — click confirm
    await userEvent.click(screen.getByRole("button", { name: /confirm barangay/i }));
    // Onboarding ends on the install step, not the zone picker. jsdom exposes
    // no beforeinstallprompt, so it renders its manual-instructions form and
    // the only way onward is the dismissal button.
    await userEvent.click(screen.getByRole("button", { name: /not now/i }));
    unmount();
  }

  // These two force the offline fallback (which renders plain zone-name text,
  // unlike the Leaflet map) so zone ordering is actually observable in jsdom.
  // The online/offline stub is scoped here via beforeEach/afterEach — not an
  // inline statement at the end of the test body — so a failing assertion
  // above it still leaves navigator.onLine restored for every other test.
  describe("when offline", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    });

    afterEach(() => {
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    });

    it("orders the picked zone first on the home page, not zone-1's", async () => {
      // Deliberately not the first zone: proves the choice is read, not defaulted.
      const picked = FIXTURE_REFERENCE_DATA.zones[1];

      await completeOnboardingWith(picked.name);
      expect(replace).toHaveBeenCalledWith("/");

      renderWithData(<Home />);

      const zoneNames = screen.getAllByText(new RegExp(FIXTURE_REFERENCE_DATA.zones.map((z) => z.name).join("|")));
      expect(zoneNames[0]).toHaveTextContent(picked.name);
    });

    it("falls back to the first zone when nothing has been picked yet", () => {
      // Onboarded, but no zone ever selected — a different fact from "not
      // onboarded" (ONBOARDED_KEY vs. the separate selectedZoneId key).
      // Home only renders its zone content once onboarded is confirmed
      // true; leaving this unset would show OnboardingGate's redirect
      // skeleton instead, which is a different test (see the flow tests
      // above and OnboardingGate's own test file).
      window.localStorage.setItem(ONBOARDED_KEY, "true");
      markConsented();
      renderWithData(<Home />);

      const zoneNames = screen.getAllByText(new RegExp(FIXTURE_REFERENCE_DATA.zones.map((z) => z.name).join("|")));
      expect(zoneNames[0]).toHaveTextContent(FIXTURE_REFERENCE_DATA.zones[0].name);
    });
  });

  it("sends a returning resident who accepts a changed notice straight home, keeping their barangay", async () => {
    // Set up under an older notice: the gate brings them back here for the new one.
    window.localStorage.setItem(ONBOARDED_KEY, "true");
    setSelectedZoneId(FIXTURE_REFERENCE_DATA.zones[1].id);
    expect(hasOnboarded()).toBe(false);

    renderWithData(<OnboardingPage />);
    await userEvent.click(screen.getByRole("button", { name: /i understand/i }));

    expect(replace).toHaveBeenCalledWith("/");
    expect(hasOnboarded()).toBe(true);
    expect(getSelectedZoneId()).toBe(FIXTURE_REFERENCE_DATA.zones[1].id);
  });

  it("does not send an onboarded visitor back to onboarding", async () => {
    await completeOnboardingWith(FIXTURE_REFERENCE_DATA.zones[1].name);
    replace.mockClear();

    renderWithData(<Home />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("gives the home page a level-1 heading so it has document structure", async () => {
    await completeOnboardingWith(FIXTURE_REFERENCE_DATA.zones[0].name);
    renderWithData(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
