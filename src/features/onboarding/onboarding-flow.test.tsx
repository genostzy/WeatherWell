import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingPage from "@/app/onboarding/page";
import Home from "@/app/page";
import { MOCK_ZONES } from "@/lib/mock-data";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
}));

/**
 * Cross-page integration: the zone chosen in onboarding has to survive the
 * navigation to the home screen. Before this was wired up, every page
 * hardcoded MOCK_ZONES[0] and a user who picked another barangay saw someone
 * else's alerts.
 */
describe("onboarding → home zone threading", () => {
  beforeEach(() => {
    replace.mockClear();
    window.localStorage.clear();
  });

  async function completeOnboardingWith(zoneName: string) {
    const { unmount } = render(<OnboardingPage />);
    await userEvent.click(screen.getByRole("button", { name: /i understand/i }));
    await userEvent.click(screen.getByText(zoneName));
    await userEvent.click(screen.getByRole("button", { name: /confirm zone/i }));
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
      const picked = MOCK_ZONES[1];

      await completeOnboardingWith(picked.name);
      expect(replace).toHaveBeenCalledWith("/");

      render(<Home />);

      const zoneNames = screen.getAllByText(new RegExp(MOCK_ZONES.map((z) => z.name).join("|")));
      expect(zoneNames[0]).toHaveTextContent(picked.name);
    });

    it("falls back to the first zone when nothing has been picked yet", () => {
      render(<Home />);

      const zoneNames = screen.getAllByText(new RegExp(MOCK_ZONES.map((z) => z.name).join("|")));
      expect(zoneNames[0]).toHaveTextContent(MOCK_ZONES[0].name);
    });
  });

  it("does not send an onboarded visitor back to onboarding", async () => {
    await completeOnboardingWith(MOCK_ZONES[1].name);
    replace.mockClear();

    render(<Home />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("gives the home page a level-1 heading so it has document structure", async () => {
    await completeOnboardingWith(MOCK_ZONES[0].name);
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
