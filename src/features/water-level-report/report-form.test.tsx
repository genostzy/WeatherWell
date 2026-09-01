import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportForm } from "./report-form";

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
});
