import { describe, it, expect } from "vitest";
import { render as rtlRender, screen, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmergencyHotlineButton } from "./emergency-hotline-button";

// EmergencyHotlineButton now wraps its link in a shadcn Tooltip (Radix),
// which throws without an ancestor TooltipProvider. The real app supplies
// this via layout.tsx; supply the same here. TooltipTrigger asChild clones
// its child rather than wrapping it, so the `link` role queries below are
// unaffected.
function render(ui: ReactElement): RenderResult {
  return rtlRender(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("EmergencyHotlineButton", () => {
  it("renders a tel: link with the given hotline number", () => {
    render(<EmergencyHotlineButton hotlineNumber="09171234567" />);
    const link = screen.getByRole("link", { name: /emergency hotline/i });
    expect(link).toHaveAttribute("href", "tel:09171234567");
  });

  it("meets the 44px minimum touch target", () => {
    render(<EmergencyHotlineButton hotlineNumber="09171234567" />);
    const link = screen.getByRole("link", { name: /emergency hotline/i });
    // h-14/w-14 in Tailwind is 3.5rem = 56px, comfortably over the 44px minimum.
    expect(link.className).toMatch(/h-14/);
    expect(link.className).toMatch(/w-14/);
  });
});
