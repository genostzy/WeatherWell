import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmergencyHotlineButton } from "./emergency-hotline-button";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

// EmergencyHotlineButton wraps its link in a shadcn Tooltip (Radix), which
// throws without an ancestor TooltipProvider — the real app supplies this
// via layout.tsx. TooltipTrigger asChild clones its child rather than
// wrapping it, so the `link` role queries below are unaffected.
function renderButton(hotlineNumber: string) {
  return render(
    <LanguageProvider>
      <TooltipProvider>
        <EmergencyHotlineButton hotlineNumber={hotlineNumber} />
      </TooltipProvider>
    </LanguageProvider>
  );
}

describe("EmergencyHotlineButton", () => {
  it("renders a tel: link for a real number", () => {
    renderButton("09171234567");
    expect(screen.getByRole("link")).toHaveAttribute("href", "tel:09171234567");
  });

  it("renders nothing for the seed's placeholder number", () => {
    // A red emergency call button that dials 00000000000 is worse than no
    // button: it costs a resident the seconds they spend discovering it
    // does not work.
    renderButton("00000000000");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders nothing for an empty number", () => {
    renderButton("");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
