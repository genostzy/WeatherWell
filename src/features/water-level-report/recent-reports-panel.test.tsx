import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RecentReportsPanel } from "./recent-reports-panel";
import { MOCK_WATER_LEVEL_REPORTS } from "@/lib/mock-data";
import { REPORT_THRESHOLD } from "@/lib/weather-thresholds";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { addWaterLevelReport } from "@/lib/water-level-reports";
import { DEPTH_LABEL } from "@/lib/depth";

// addWaterLevelReport triggers a drain, which calls ensureAnonymousSession.
// Stub it to resolve null (offline-like) so the real Supabase browser client
// is never touched and, since drainOutbox then never runs, the dynamically
// -imported Server Action (submit-water-level-report.ts, which transitively
// pulls in user-server.ts's `import "server-only"`) never loads either.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: vi.fn().mockResolvedValue(null),
  useSessionUserId: () => null,
}));

/** What /api/reports would return for the seeded mock reports. */
function seededServerReports() {
  return MOCK_WATER_LEVEL_REPORTS.map((report) => ({
    id: report.id,
    zoneId: report.zoneId,
    depthLevel: report.depthLevel,
    reporterId: "seed-user",
    reportedAt: new Date(Date.now() - report.minutesAgo * 60 * 1000).toISOString(),
    trustWeight: report.trustWeight,
    isOutlier: report.isOutlier,
  }));
}

describe("RecentReportsPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => seededServerReports() })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every recent report for the zone", async () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    render(<RecentReportsPanel zone={zone} />);

    for (const report of MOCK_WATER_LEVEL_REPORTS.filter((r) => r.zoneId === zone.id)) {
      await waitFor(() =>
        expect(
          screen.getAllByText(new RegExp(DEPTH_LABEL[report.depthLevel].en, "i")).length
        ).toBeGreaterThan(0)
      );
    }
  });

  it("counts only agreeing reports toward the threshold, excluding outliers", async () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    const zoneReports = MOCK_WATER_LEVEL_REPORTS.filter((r) => r.zoneId === zone.id);
    const agreeing = zoneReports.filter((report) => !report.isOutlier).length;
    // zone-1's fixture deliberately includes one outlier, so this proves the
    // count excludes it rather than just matching the raw report total.
    expect(agreeing).toBeLessThan(zoneReports.length);

    render(<RecentReportsPanel zone={zone} />);
    await waitFor(() => expect(screen.getByText(String(agreeing))).toBeInTheDocument());
    expect(screen.getByText(new RegExp(`${REPORT_THRESHOLD} reports needed`, "i"))).toBeInTheDocument();
  });

  it("counts only reports from the alert engine's 6-hour window as agreeing (found checking the live site)", async () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    const row = (id: string, hoursAgo: number) => ({
      id,
      zoneId: zone.id,
      depthLevel: "knee",
      reportedAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
      trustWeight: 1,
      isOutlier: false,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [row("a", 1), row("b", 5), row("c", 7), row("d", 40)] }));
    render(<RecentReportsPanel zone={zone} />);
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(screen.getByText(/in the last 6 hours/i)).toBeInTheDocument();
  });

  it("marks an outlier as downweighted rather than hiding it", async () => {
    render(<RecentReportsPanel zone={FIXTURE_REFERENCE_DATA.zones[0]} />);
    await waitFor(() => expect(screen.getByText(/downweighted/i)).toBeInTheDocument());
  });

  it("invites the first report when a zone has none", async () => {
    render(
      <RecentReportsPanel zone={{ ...FIXTURE_REFERENCE_DATA.zones[0], id: "zone-with-no-reports" }} />
    );
    await waitFor(() => expect(screen.getByText(/yours would be the first/i)).toBeInTheDocument());
  });

  it("shows a freshly submitted report immediately, not just the seeded ones", () => {
    // The outbox is synchronous (localStorage-backed), so the optimistic row
    // from addWaterLevelReport must appear before /api/reports's mocked
    // fetch promise has even had a chance to resolve — this assertion runs
    // to completion before that microtask fires.
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    addWaterLevelReport(zone.id, "neck");

    render(<RecentReportsPanel zone={zone} />);

    expect(screen.getByText("1")).toBeInTheDocument(); // one agreeing report
    expect(screen.getByText(/neck-deep/i)).toBeInTheDocument();
    expect(screen.getByText(/0 min ago/i)).toBeInTheDocument();
  });
});
