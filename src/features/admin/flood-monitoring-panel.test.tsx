import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { FloodMonitoringPanel } from "./flood-monitoring-panel";
import { MOCK_WATER_LEVEL_REPORTS } from "@/lib/mock-data";
import { REPORT_THRESHOLD } from "@/lib/weather-thresholds";
import { countReportsToday } from "@/lib/reports-today";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import type { Official } from "@/lib/auth/official";

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
    reporterEstablished: true,
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

  it("stays below threshold when agreeing reports come only from brand-new devices (idea 3)", async () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    const fresh = [1, 2, 3].map((n) => ({
      id: `fresh-${n}`,
      zoneId: zone.id,
      depthLevel: "knee",
      reportedAt: new Date().toISOString(),
      trustWeight: 0.2,
      isOutlier: false,
      reporterEstablished: false,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => fresh }));
    renderWithData(<FloodMonitoringPanel zones={[zone]} />);
    await waitFor(() => expect(screen.getByText(/3 reports today/i)).toBeInTheDocument());
    expect(screen.getByText(/below threshold/i)).toBeInTheDocument();
  });

  it("needs a reporter whose identity is over a day old, as the engine does", async () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    const reports = (established: boolean) =>
      [1, 2, 3, 4, 5].map((n) => ({
        id: `r-${n}`,
        zoneId: zone.id,
        depthLevel: "knee",
        reportedAt: new Date().toISOString(),
        trustWeight: 0.2,
        isOutlier: false,
        reporterEstablished: established && n === 1,
      }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => reports(false) }));
    const { unmount } = renderWithData(<FloodMonitoringPanel zones={[zone]} />);
    await waitFor(() => expect(screen.getByText(/5 reports today/i)).toBeInTheDocument());
    expect(screen.getByText(/below threshold/i)).toBeInTheDocument();
    unmount();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => reports(true) }));
    renderWithData(<FloodMonitoringPanel zones={[zone]} />);
    await waitFor(() => expect(screen.getByText(/report threshold met/i)).toBeInTheDocument());
  });

  it("counts a zone's reports today from the live feed, not invented figures", async () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    const expected = countReportsToday(seededServerReports(), new Set([zone.id]));
    renderWithData(<FloodMonitoringPanel zones={[zone]} />);
    await waitFor(() => expect(screen.getByText(`${expected} reports today`)).toBeInTheDocument());
    expect(expected).toBeGreaterThan(0);
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

describe("FloodMonitoringPanel with no hazard data (I3)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders every zone with its susceptibility shown as unknown", () => {
    renderWithData(<FloodMonitoringPanel zones={FIXTURE_REFERENCE_DATA.zones} />, { data: { hazards: {} } });

    expect(screen.getAllByText("Susceptibility unknown")).toHaveLength(FIXTURE_REFERENCE_DATA.zones.length);
  });
});
