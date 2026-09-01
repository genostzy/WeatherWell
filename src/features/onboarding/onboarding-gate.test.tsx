import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { OnboardingGate } from "./onboarding-gate";
import { ONBOARDED_KEY } from "./onboarding-storage";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

describe("OnboardingGate", () => {
  beforeEach(() => {
    replace.mockClear();
    window.localStorage.clear();
  });

  it("redirects a first-time visitor to onboarding", () => {
    render(<OnboardingGate />);
    expect(replace).toHaveBeenCalledWith("/onboarding");
  });

  it("leaves an already-onboarded visitor alone", () => {
    window.localStorage.setItem(ONBOARDED_KEY, "true");
    render(<OnboardingGate />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders a loading skeleton, not the page underneath, before the check resolves", () => {
    const { container } = render(<OnboardingGate />);
    expect(container.querySelector('[data-testid="onboarding-gate-skeleton"]')).toBeInTheDocument();
  });
});
