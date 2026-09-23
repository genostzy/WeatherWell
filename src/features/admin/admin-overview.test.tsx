import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";

// The community-pin KPI test below queues a write, whose drain reaches the
// real Supabase browser client. Nothing here should sign anyone in.
vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: async () => null,
  useSessionUserId: () => null,
}));

import { AdminOverview } from "./admin-overview";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { addCommunityPin } from "@/lib/community-pins";
import type { Official } from "@/lib/auth/official";
import type { AlertRecord } from "@/lib/types";
import { buildZoneInputForZone, computeZoneState } from "@/lib/risk-engine/score";

describe("AdminOverview dashboard", () => {
  it("leads with at-a-glance figures rather than the simulation", () => {
    renderWithData(<AdminOverview />);
    expect(screen.getByText(/zones under alert/i)).toBeInTheDocument();
    // "Reports today" also labels a per-zone line in the flood panel below.
    expect(screen.getAllByText(/reports today/i).length).toBeGreaterThan(0);
    // The simulation now lives on its own page, reachable by link only.
    expect(screen.queryByRole("button", { name: /start simulation/i })).not.toBeInTheDocument();
  });

  it("links out to the simulation page", () => {
    renderWithData(<AdminOverview />);
    const link = screen.getByRole("link", { name: /open simulation/i });
    expect(link).toHaveAttribute("href", "/admin/simulation");
  });

  it("covers every hazard the PRD asks the admin to monitor", () => {
    renderWithData(<AdminOverview />);
    expect(screen.getByText(/flood monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/heavy rainfall monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/typhoon tracking/i)).toBeInTheDocument();
    expect(screen.getByText(/landslide risk/i)).toBeInTheDocument();
    expect(screen.getByText(/evacuation management/i)).toBeInTheDocument();
  });

  it("shows report and alert trend analytics", () => {
    renderWithData(<AdminOverview />);
    expect(screen.getByText(/crowd reports over time/i)).toBeInTheDocument();
    expect(screen.getByText(/false alarm/i)).toBeInTheDocument();
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
  it("renders, with a finite risk score, when no zone has hazard rows", () => {
    renderWithData(<AdminOverview />, { data: { hazards: {} } });

    const card = screen.getByText(/^highest risk score$/i).closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText(/^\d+$/)).toBeInTheDocument();
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

describe("AdminOverview risk score across town lines (I4)", () => {
  it("counts an alert on an upstream barangay outside the official's area", () => {
    // zone-1 (Mapandan) drains into zone-2 (Mangaldan). A Mangaldan official
    // only sees zone-2, but zone-1's alert still raises zone-2's score.
    const [zone1, zone2] = FIXTURE_REFERENCE_DATA.zones;
    expect(zone1.downstreamZoneId).toBe(zone2.id);
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: zone2.psgcBarangayCode,
      areaName: "Mangaldan barangay",
      level: "barangay",
    };
    const upstreamAlert: AlertRecord = {
      id: "upstream",
      zoneId: zone1.id,
      severity: "red",
      message: { en: "x", fil: "x" },
      source: "manual",
      confidence: "validated",
      issuedAt: new Date().toISOString(),
      isActive: true,
    };

    renderWithData(<AdminOverview />, { official, alerts: [upstreamAlert] });

    const hazards = FIXTURE_REFERENCE_DATA.hazards;
    const withCascade = computeZoneState(
      buildZoneInputForZone(zone2, FIXTURE_REFERENCE_DATA.zones, (id) => id === zone1.id, hazards)
    ).riskScore;
    const withoutCascade = computeZoneState(buildZoneInputForZone(zone2, [zone2], () => false, hazards)).riskScore;
    expect(withCascade).toBeGreaterThan(withoutCascade);

    const card = screen.getByText(/^highest risk score$/i).closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText(String(withCascade))).toBeInTheDocument();
    // Still only the official's own barangay is displayed.
    expect(screen.queryAllByText(zone1.name)).toHaveLength(0);
  });
});

describe("AdminOverview for a nationwide admin", () => {
  // A real admin's areaCode ("") matches every zone nationwide (~42k in
  // production, not the 4-zone fixture set here) — found live during
  // 2026-09-22-admin-role-and-password-auth's Task 8 verification: every
  // panel below renders one row per zone, and at nationwide scale that
  // froze the browser tab entirely. The KPI tiles stay (cheap aggregates,
  // fixed at 7 cards regardless of zone count); the per-zone list panels
  // are replaced with a link to the map, which is already the app's
  // existing "see every zone at once" surface (MAP_HINT's own copy).
  const ADMIN: Official = {
    userId: "admin-1",
    displayName: "Test Admin",
    areaCode: "",
    areaName: "All areas",
    level: "admin",
  };

  it("still shows the at-a-glance KPI tiles, except the per-area risk score", () => {
    renderWithData(<AdminOverview />, { official: ADMIN });
    expect(screen.getByText(/zones under alert/i)).toBeInTheDocument();
    expect(screen.getByText(/reports today/i)).toBeInTheDocument();
    // Skipped outright rather than faked cheaply — see admin-overview.tsx's
    // own comment: it would cost an O(zones²) scoring pass at national scale.
    expect(screen.queryByText(/highest risk score/i)).not.toBeInTheDocument();
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
