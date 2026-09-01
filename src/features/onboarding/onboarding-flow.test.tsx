import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingPage from "@/app/onboarding/page";
import Home from "@/app/page";
import { MOCK_ZONES, MOCK_ALERTS } from "@/lib/mock-data";

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

  it("shows the picked zone's data on the home page, not zone-1's", async () => {
    // Deliberately not the first zone: proves the choice is read, not defaulted.
    const picked = MOCK_ZONES[1];
    const pickedAlert = MOCK_ALERTS.find((a) => a.zoneId === picked.id)!;
    const defaultAlert = MOCK_ALERTS.find((a) => a.zoneId === MOCK_ZONES[0].id)!;

    await completeOnboardingWith(picked.name);
    expect(replace).toHaveBeenCalledWith("/");

    render(<Home />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(picked.name);
    expect(screen.getByText(pickedAlert.message.en)).toBeInTheDocument();
    expect(screen.queryByText(defaultAlert.message.en)).not.toBeInTheDocument();
  });

  it("does not send an onboarded visitor back to onboarding", async () => {
    await completeOnboardingWith(MOCK_ZONES[1].name);
    replace.mockClear();

    render(<Home />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("falls back to the first zone when nothing has been picked yet", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      MOCK_ZONES[0].name
    );
  });

  it("gives the home page a level-1 heading so it has document structure", async () => {
    await completeOnboardingWith(MOCK_ZONES[0].name);
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
