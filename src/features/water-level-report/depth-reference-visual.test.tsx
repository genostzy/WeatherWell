import { describe, it, expect } from "vitest";
import { render as rtlRender, screen, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DepthReferenceVisual,
  ADULT_HEIGHT_CM,
  CHILD_HEIGHT_CM,
} from "./depth-reference-visual";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { DEPTH_LABEL } from "@/lib/depth";

// The depth label is now wrapped in a shadcn Tooltip (Radix), which throws
// if rendered without an ancestor TooltipProvider. The real app supplies
// this via layout.tsx; these unit tests render the component in isolation,
// so we supply the same provider here.
function render(ui: ReactElement): RenderResult {
  return rtlRender(<TooltipProvider>{ui}</TooltipProvider>);
}

function fillHeight(container: HTMLElement, who: "adult" | "child"): number {
  const rect = container.querySelector(`[data-testid="${who}-fill"]`);
  return Number(rect?.getAttribute("height"));
}

describe("DepthReferenceVisual", () => {
  it("renders both an adult and a child reference figure", () => {
    render(<DepthReferenceVisual depthLevel="knee" />);
    expect(screen.getByLabelText(/adult reference figure/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/child reference figure/i)).toBeInTheDocument();
  });

  it("draws the child shorter than the adult", () => {
    const { container } = render(<DepthReferenceVisual depthLevel="dry" />);
    const adult = container.querySelector('[data-testid="adult-body"]');
    const child = container.querySelector('[data-testid="child-body"]');
    expect(Number(child?.getAttribute("data-height-cm"))).toBeLessThan(
      Number(adult?.getAttribute("data-height-cm"))
    );
  });

  it("puts both figures under the same absolute waterline", () => {
    // At ankle depth the water is 15cm off the ground for everyone.
    const { container } = render(<DepthReferenceVisual depthLevel="ankle" />);
    expect(fillHeight(container, "adult")).toBe(15);
    expect(fillHeight(container, "child")).toBe(15);
  });

  it("submerges the child completely at a depth the adult is only partly in", () => {
    const { container } = render(<DepthReferenceVisual depthLevel="neck" />);
    expect(fillHeight(container, "child")).toBe(CHILD_HEIGHT_CM);
    expect(fillHeight(container, "adult")).toBeLessThan(ADULT_HEIGHT_CM);
  });

  it("raises the water as the depth level increases", () => {
    const { container, rerender } = render(<DepthReferenceVisual depthLevel="ankle" />);
    const shallow = fillHeight(container, "adult");
    rerender(
      <TooltipProvider>
        <DepthReferenceVisual depthLevel="waist" />
      </TooltipProvider>
    );
    expect(fillHeight(container, "adult")).toBeGreaterThan(shallow);
  });

  it("draws a single shared waterline", () => {
    const { container } = render(<DepthReferenceVisual depthLevel="knee" />);
    expect(container.querySelectorAll('[data-testid="waterline"]')).toHaveLength(1);
  });

  it("shows the depth label", () => {
    render(<DepthReferenceVisual depthLevel="waist" />);
    expect(screen.getByText("Waist-deep")).toBeInTheDocument();
  });

  it("shows the depth label in Filipino when that language is active", () => {
    rtlRender(
      <TooltipProvider>
        <LanguageProvider initialLang="fil">
          <DepthReferenceVisual depthLevel="waist" />
        </LanguageProvider>
      </TooltipProvider>
    );
    expect(screen.getByText(DEPTH_LABEL.waist.fil)).toBeInTheDocument();
    expect(screen.queryByText(DEPTH_LABEL.waist.en)).not.toBeInTheDocument();
  });
});
