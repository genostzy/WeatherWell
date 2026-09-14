import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { FloodMonitoringPanel } from "./flood-monitoring-panel";
import { MOCK_WATER_LEVEL_REPORTS, REPORT_THRESHOLD } from "@/lib/mock-data";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import type { Official } from "@/lib/auth/official";

vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: vi.fn().mockResolvedValue(null),
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

describe("FloodMonitoringPanel", () => {
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

  it("shows every zone with a manage link back to its dashboard", () => {
    renderWithData(<FloodMonitoringPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
    const manageLinks = screen.getAllByRole("link", { name: /manage/i });
    expect(manageLinks).toHaveLength(FIXTURE_REFERENCE_DATA.zones.length);
    expect(manageLinks[0]).toHaveAttribute("href", `/admin/zone/${FIXTURE_REFERENCE_DATA.zones[0].id}`);
  });

  it("flags a zone whose agreeing reports have met the auto-trigger threshold", async () => {
    renderWithData(<FloodMonitoringPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    const zoneWithEnough = FIXTURE_REFERENCE_DATA.zones.find(
      (zone) =>
        MOCK_WATER_LEVEL_REPORTS.filter((r) => r.zoneId === zone.id && !r.isOutlier).length >=
        REPORT_THRESHOLD
    );
    expect(zoneWithEnough).toBeDefined();
    await waitFor(() => expect(screen.getAllByText(/report threshold met/i).length).toBeGreaterThan(0));
  });

  it("shows the latest report's depth for a zone with reports", async () => {
    renderWithData(<FloodMonitoringPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    const zoneWithReports = FIXTURE_REFERENCE_DATA.zones.find(
      (z) => MOCK_WATER_LEVEL_REPORTS.filter((r) => r.zoneId === z.id).length > 0
    )!;
    const latest = [...MOCK_WATER_LEVEL_REPORTS]
      .filter((r) => r.zoneId === zoneWithReports.id)
      .sort((a, b) => a.minutesAgo - b.minutesAgo)[0];
    await waitFor(() =>
      expect(screen.getAllByText(new RegExp(latest.depthLevel, "i")).length).toBeGreaterThan(0)
    );
  });

  it("only monitors zones inside the official's area", () => {
    const [ownZone, otherZone] = FIXTURE_REFERENCE_DATA.zones;
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: ownZone.psgcBarangayCode,
      areaName: "Own barangay",
      level: "barangay",
    };
    renderWithData(<FloodMonitoringPanel zones={FIXTURE_REFERENCE_DATA.zones} />, { official });

    expect(screen.getByText(ownZone.name)).toBeInTheDocument();
    expect(screen.queryByText(otherZone.name)).not.toBeInTheDocument();
  });
});
