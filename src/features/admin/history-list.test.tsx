import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithData } from "@/test-utils/render-with-data";
import { HistoryList } from "./history-list";
import type { OfficialAction } from "@/lib/official-actions-mapper";

const ZONES = [{ id: "zone-1", name: "Barangay Uno" }];

function action(overrides: Partial<OfficialAction>): OfficialAction {
  return {
    id: 1,
    occurredAt: "2026-09-14T02:14:00.000Z",
    actorName: "Juan Dela Cruz",
    actorArea: "0199901001",
    action: "alert.set",
    zoneId: "zone-1",
    targetId: "alert-1",
    detail: { from: "orange", to: "yellow" },
    ...overrides,
  };
}

describe("HistoryList", () => {
  it("renders a row's description, barangay name, actor and time", () => {
    renderWithData(<HistoryList actions={[action({})]} zones={ZONES} scope="mine" />);

    expect(screen.getByText(/Lowered to Advisory — Barangay Uno/)).toBeInTheDocument();
    expect(screen.getByText(/Juan Dela Cruz/)).toBeInTheDocument();
  });

  it("renders an appointment row (no zone) without a barangay name", () => {
    renderWithData(
      <HistoryList
        actions={[
          action({
            action: "official.appointed",
            zoneId: null,
            detail: { area_name: "Uno, Testtown", display_name: "Juan Dela Cruz" },
          }),
        ]}
        zones={ZONES}
        scope="all"
      />
    );

    expect(screen.getByText("Appointed Juan Dela Cruz for Uno, Testtown")).toBeInTheDocument();
  });

  it("shows the empty-state message when there are no actions", () => {
    renderWithData(<HistoryList actions={[]} zones={ZONES} scope="mine" />);

    expect(screen.getByText(/no recorded actions yet/i)).toBeInTheDocument();
  });

  it("marks My area current when scope is mine, and All areas current when scope is all", () => {
    const { rerender } = renderWithData(<HistoryList actions={[]} zones={ZONES} scope="mine" />);
    expect(screen.getByRole("link", { name: /my area/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /all areas/i })).not.toHaveAttribute("aria-current");

    rerender(<HistoryList actions={[]} zones={ZONES} scope="all" />);
    expect(screen.getByRole("link", { name: /all areas/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /my area/i })).not.toHaveAttribute("aria-current");
  });

  it("links My area and All areas to the corresponding ?scope= URL", () => {
    renderWithData(<HistoryList actions={[]} zones={ZONES} scope="mine" />);
    expect(screen.getByRole("link", { name: /my area/i })).toHaveAttribute("href", "/admin/history?scope=mine");
    expect(screen.getByRole("link", { name: /all areas/i })).toHaveAttribute("href", "/admin/history?scope=all");
  });
});
