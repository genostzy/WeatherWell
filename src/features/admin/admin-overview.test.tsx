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
