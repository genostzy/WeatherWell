import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  it("shows a database-written actor name in Filipino when the language is Filipino (M2)", () => {
    renderWithData(
      <HistoryList
        actions={[action({ action: "pin.removed", actorName: "Automatic — net score", detail: { reason: "net_score" } })]}
        zones={ZONES}
        scope="mine"
      />,
      { lang: "fil" }
    );

    expect(screen.getByText(/^Awtomatiko — net score, /)).toBeInTheDocument();
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

describe("HistoryList timestamps (I6)", () => {
  // A fixed local clock. Dates are built with the local-time Date constructor
  // so "today" means the same thing to the test as to the component,
  // whatever timezone the machine running the suite is in.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a date as well as a time for an entry from an earlier day", () => {
    renderWithData(
      <HistoryList actions={[action({ occurredAt: new Date(2026, 8, 8, 14, 14).toISOString() })]} zones={ZONES} scope="mine" />
    );

    expect(screen.getByText(/Juan Dela Cruz, Sep 8, 2:14\sPM/)).toBeInTheDocument();
  });

  it("shows the time only for an entry from today", () => {
    renderWithData(
      <HistoryList actions={[action({ occurredAt: new Date(2026, 8, 15, 9, 5).toISOString() })]} zones={ZONES} scope="mine" />
    );

    const line = screen.getByText(/Juan Dela Cruz, /);
    expect(line).toHaveTextContent(/9:05/);
    expect(line).not.toHaveTextContent(/Sep/);
  });

  it("shows the date in Filipino too", () => {
    renderWithData(
      <HistoryList actions={[action({ occurredAt: new Date(2026, 8, 8, 14, 14).toISOString() })]} zones={ZONES} scope="mine" />,
      { lang: "fil" }
    );

    expect(screen.getByText(/Set 8, 2:14\sPM/)).toBeInTheDocument();
  });

  it("has no back link of its own; the officials menu covers it (found checking the officials screen)", () => {
    renderWithData(<HistoryList actions={[]} zones={ZONES} scope="mine" />);
    expect(screen.queryByRole("link", { name: /back to/i })).not.toBeInTheDocument();
  });
});
