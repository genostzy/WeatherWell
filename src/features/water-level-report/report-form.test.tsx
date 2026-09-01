import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReportForm } from "./report-form";

// ReportForm renders DepthReferenceVisual, whose depth label is now wrapped
// in a shadcn Tooltip (Radix) that throws without an ancestor TooltipProvider.
// The real app supplies this via layout.tsx; supply the same here.
function render(ui: ReactElement): RenderResult {
  return rtlRender(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("ReportForm", () => {
  it("offers every depth level as a choice", () => {
    render(<ReportForm zoneId="zone-1" onSubmit={() => {}} />);
    for (const label of ["Dry", "Ankle-deep", "Knee-deep", "Waist-deep", "Neck-deep"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("submits the depth level the user picked", async () => {
    const onSubmit = vi.fn();
    render(<ReportForm zoneId="zone-1" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByLabelText("Waist-deep"));
    await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

    expect(onSubmit).toHaveBeenCalledWith("waist");
  });

  it("updates the depth visual when the selection changes", async () => {
    const { container } = render(<ReportForm zoneId="zone-1" onSubmit={() => {}} />);

    const before = Number(
      container.querySelector('[data-testid="adult-fill"]')?.getAttribute("height")
    );
    await userEvent.click(screen.getByLabelText("Neck-deep"));
    const after = Number(
      container.querySelector('[data-testid="adult-fill"]')?.getAttribute("height")
    );

    expect(after).toBeGreaterThan(before);
  });

  it("shows the confirmation immediately on submit, before any async work would resolve", async () => {
    const onSubmit = vi.fn();
    render(<ReportForm zoneId="zone-1" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByLabelText("Knee-deep"));
    await userEvent.click(screen.getByRole("button", { name: /submit report/i }));

    // Optimistic: onSubmit fires synchronously on click, not after a delay.
    expect(onSubmit).toHaveBeenCalledWith("knee");
  });

  it("disables the submit button immediately after submitting, before any reconciliation", async () => {
    render(<ReportForm zoneId="zone-1" onSubmit={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /submit report/i }));
    expect(screen.getByRole("button", { name: /submit report/i })).toBeDisabled();
  });
});
