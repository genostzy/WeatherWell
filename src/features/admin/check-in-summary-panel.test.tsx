import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CheckInSummaryPanel } from "./check-in-summary-panel";

// useEvacuationCheckIns now reads useSessionUserId (to reconcile a queued
// check-in by (zone, uid) rather than by zone alone) — stub it so this panel
// never reaches the real Supabase browser client, which throws outside a
// browser env with .env.local loaded. This panel never writes; an operator
// reading their own uid here is display-only, same reasoning check-in-panel's
// test uses for the same mock.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: vi.fn().mockResolvedValue(null),
  useSessionUserId: () => "operator-uid",
}));

/** What /api/check-ins would return, RLS already having scoped the rows. */
function seededServerCheckIns(
  rows: { id: string; zoneId: string; userId: string; status: "safe" | "needs_help" }[]
) {
  return rows.map((row) => ({ ...row, checkedInAt: new Date().toISOString() }));
}

function stubCheckIns(rows: ReturnType<typeof seededServerCheckIns>) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => rows }));
}

describe("CheckInSummaryPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty state when nobody has checked in for the zone", async () => {
    stubCheckIns([]);
    render(<CheckInSummaryPanel zoneId="zone-1" />);
    await waitFor(() => expect(screen.getByText(/no check-ins yet/i)).toBeInTheDocument());
  });

  it("counts safe and needs-help check-ins separately", async () => {
    stubCheckIns(
      seededServerCheckIns([
        { id: "c1", zoneId: "zone-1", userId: "user-a", status: "safe" },
        { id: "c2", zoneId: "zone-1", userId: "user-b", status: "needs_help" },
      ])
    );
    render(<CheckInSummaryPanel zoneId="zone-1" />);
    // One "1" for the safe count, one "1" for the needs-help count.
    await waitFor(() => expect(screen.getAllByText("1", { exact: true })).toHaveLength(2));
  });

  it("only counts check-ins for the requested zone, not other zones", async () => {
    stubCheckIns(
      seededServerCheckIns([
        { id: "c1", zoneId: "zone-1", userId: "user-a", status: "safe" },
        { id: "c2", zoneId: "zone-2", userId: "user-b", status: "needs_help" },
      ])
    );
    render(<CheckInSummaryPanel zoneId="zone-1" />);
    // zone-1 has one "safe" and zero "needs_help" — the zone-2 needs_help entry must not count here.
    await waitFor(() => expect(screen.getByText(/checked in safe/i)).toBeInTheDocument());
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
