import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";

// The community-pin KPI test below queues a write, whose drain reaches the
// real Supabase browser client. Nothing here should sign anyone in.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: async () => null,
  useSessionUserId: () => null,
}));

vi.mock("@/lib/use-weather-data", () => ({
  useWeatherData: () => ({ current: null, rainfallHistory: [], rainfallForecast: [], isLoading: false, error: null }),
}));

import { AdminOverview } from "./admin-overview";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { addCommunityPin } from "@/lib/community-pins";
import type { Official } from "@/lib/auth/official";

describe("AdminOverview dashboard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("leads with at-a-glance figures rather than the simulation", () => {
    renderWithData(<AdminOverview />);
    expect(screen.getByText(/zones under alert/i)).toBeInTheDocument();
    // "Reports today" also labels a per-zone line in the flood panel below.
    expect(screen.getAllByText(/reports today/i).length).toBeGreaterThan(0);
    // The simulation now lives on its own page, reachable by link only.
    expect(screen.queryByRole("button", { name: /start simulation/i })).not.toBeInTheDocument();
  });

  it("opens on what needs the official's attention, before the figures (idea 5)", () => {
    renderWithData(<AdminOverview />);
    const inbox = screen.getByText(/needs your attention/i);
    const glance = screen.getByText(/at a glance/i);
    expect(inbox.compareDocumentPosition(glance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("links out to the simulation page", () => {
    renderWithData(<AdminOverview />);
    const link = screen.getByRole("link", { name: /open simulation/i });
    expect(link).toHaveAttribute("href", "/admin/simulation");
  });

  it("covers every hazard the PRD asks the admin to monitor", () => {
    renderWithData(<AdminOverview />);
    expect(screen.getByText(/flood monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/typhoon tracking/i)).toBeInTheDocument();
    expect(screen.getByText(/landslide risk/i)).toBeInTheDocument();
    expect(screen.getByText(/evacuation management/i)).toBeInTheDocument();
  });

  it("shows no figure the app has no real source for", () => {
    renderWithData(<AdminOverview />);
    expect(screen.queryByText(/heaviest rainfall/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/highest risk score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/crowd reports over time/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/false alarm/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/heavy rainfall monitoring/i)).not.toBeInTheDocument();
  });

  it("counts today's real reports in the official's area", async () => {
    const [zone1, zone2] = FIXTURE_REFERENCE_DATA.zones;
    const now = new Date().toISOString();
    const row = (id: string, zoneId: string) => ({ id, zoneId, depthLevel: "ankle", reportedAt: now, trustWeight: 1, isOutlier: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          String(url).includes("/api/reports") ? [row("r1", zone1.id), row("r2", zone1.id), row("r3", zone2.id)] : [],
      }))
    );
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: zone1.psgcBarangayCode,
      areaName: "Own barangay",
      level: "barangay",
    };
    renderWithData(<AdminOverview />, { official });
    const card = screen.getByText(/^reports today$/i).closest('[data-slot="card"]') as HTMLElement;
    await waitFor(() => expect(within(card).getByText("2")).toBeInTheDocument());
  });

  it("offers a management link for every zone", () => {
    renderWithData(<AdminOverview />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      const links = screen.getAllByRole("link", { name: /manage/i });
      expect(links.some((link) => link.getAttribute("href") === `/admin/zone/${zone.id}`)).toBe(true);
    }
  });

  it("shows only the zones inside a barangay official's own area", () => {
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: FIXTURE_REFERENCE_DATA.zones[0].psgcBarangayCode,
      areaName: "Own barangay",
      level: "barangay",
    };
    renderWithData(<AdminOverview />, { official });

    expect(screen.getAllByText(FIXTURE_REFERENCE_DATA.zones[0].name).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(FIXTURE_REFERENCE_DATA.zones[1].name)).toHaveLength(0);
  });

  it("shows an empty-area notice instead of crashing when the official's area matches zero zones", () => {
    // appoint_official's raw-digit escape hatch can appoint an official to an
    // area code that covers zero barangays — genuinely reachable in
    // production, not just a test fixture.
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: "9999999999",
      areaName: "Nowhere",
      level: "barangay",
    };
    renderWithData(<AdminOverview />, { official });

    expect(screen.getByText(/no barangays in your area/i)).toBeInTheDocument();
    expect(screen.queryByText(/zones under alert/i)).not.toBeInTheDocument();
  });

  it("scopes the 'Community pins' KPI tile to the official's area, like its neighbouring tiles (F6-7)", () => {
    addCommunityPin({
      zoneId: FIXTURE_REFERENCE_DATA.zones[0].id,
      statusTag: "flooded",
      caption: "In area",
      lat: 0,
      lng: 0,
    });
    addCommunityPin({
      zoneId: FIXTURE_REFERENCE_DATA.zones[1].id,
      statusTag: "rising",
      caption: "Out of area",
      lat: 0,
      lng: 0,
    });
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: FIXTURE_REFERENCE_DATA.zones[0].psgcBarangayCode,
      areaName: "Own barangay",
      level: "barangay",
    };
    renderWithData(<AdminOverview />, { official });

    const label = screen.getByText(/^community pins$/i);
    const card = label.closest('[data-slot="card"]');
    expect(card).not.toBeNull();
    // Only the in-area pin counts, even though two pins were queued.
    expect(within(card as HTMLElement).getByText("1")).toBeInTheDocument();
  });
});

describe("AdminOverview with missing hazard data (I3)", () => {
  it("renders when no zone has hazard rows", () => {
    renderWithData(<AdminOverview />, { data: { hazards: {} } });

    expect(screen.getAllByText("Susceptibility unknown").length).toBeGreaterThan(0);
  });

  it("renders when one zone is missing a single hazard type", () => {
    renderWithData(<AdminOverview />, {
      data: { hazards: { ...FIXTURE_REFERENCE_DATA.hazards, "zone-1": { flood: "high" } } as never },
    });

    expect(screen.getByText(/zones under alert/i)).toBeInTheDocument();
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
  });
});

describe("AdminOverview for a nationwide admin", () => {
  // A real admin's areaCode ("") matches every zone nationwide (~42k in
  // production, not the 4-zone fixture set here) — found live during
  // 2026-09-22-admin-role-and-password-auth's Task 8 verification: every
  // panel below renders one row per zone, and at nationwide scale that
  // froze the browser tab entirely. The KPI tiles stay (cheap aggregates,
  // fixed at 5 cards regardless of zone count); the per-zone list panels
  // are replaced with a link to the map, which is already the app's
  // existing "see every zone at once" surface (MAP_HINT's own copy).
  const ADMIN: Official = {
    userId: "admin-1",
    displayName: "Test Admin",
    areaCode: "",
    areaName: "All areas",
    level: "admin",
  };

  it("still shows the at-a-glance KPI tiles", () => {
    renderWithData(<AdminOverview />, { official: ADMIN });
    expect(screen.getByText(/zones under alert/i)).toBeInTheDocument();
    expect(screen.getByText(/reports today/i)).toBeInTheDocument();
  });

  it("skips every per-zone list panel", () => {
    renderWithData(<AdminOverview />, { official: ADMIN });
    expect(screen.queryByText(/flood monitoring/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/heavy rainfall monitoring/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/landslide risk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/crowd reports over time/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/evacuation management/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /community pin moderation/i })).not.toBeInTheDocument();
  });

  it("points to the map instead, for zone-by-zone detail", () => {
    renderWithData(<AdminOverview />, { official: ADMIN });
    const links = screen.getAllByRole("link", { name: /open map/i });
    expect(links.some((link) => link.getAttribute("href") === "/admin/map")).toBe(true);
  });

  it("still shows a barangay official every per-zone panel, unaffected", () => {
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: FIXTURE_REFERENCE_DATA.zones[0].psgcBarangayCode,
      areaName: "Test barangay",
      level: "barangay",
    };
    renderWithData(<AdminOverview />, { official });
    expect(screen.getByText(/flood monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/evacuation management/i)).toBeInTheDocument();
  });
});
