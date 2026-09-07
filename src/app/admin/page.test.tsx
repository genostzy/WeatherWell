import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import AdminPage from "./page";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

describe("AdminPage dashboard", () => {
  it("leads with at-a-glance figures rather than the simulation", () => {
    renderWithData(<AdminPage />);
    expect(screen.getByText(/zones under alert/i)).toBeInTheDocument();
    // "Reports today" also labels a per-zone line in the flood panel below.
    expect(screen.getAllByText(/reports today/i).length).toBeGreaterThan(0);
    // The simulation now lives on its own page, reachable by link only.
    expect(screen.queryByRole("button", { name: /start simulation/i })).not.toBeInTheDocument();
  });

  it("links out to the simulation page", () => {
    renderWithData(<AdminPage />);
    const link = screen.getByRole("link", { name: /open simulation/i });
    expect(link).toHaveAttribute("href", "/admin/simulation");
  });

  it("covers every hazard the PRD asks the admin to monitor", () => {
    renderWithData(<AdminPage />);
    expect(screen.getByText(/flood monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/heavy rainfall monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/typhoon tracking/i)).toBeInTheDocument();
    expect(screen.getByText(/landslide risk/i)).toBeInTheDocument();
    expect(screen.getByText(/evacuation management/i)).toBeInTheDocument();
  });

  it("shows report and alert trend analytics", () => {
    renderWithData(<AdminPage />);
    expect(screen.getByText(/crowd reports over time/i)).toBeInTheDocument();
    expect(screen.getByText(/false alarm/i)).toBeInTheDocument();
  });

  it("offers a management link for every zone", () => {
    renderWithData(<AdminPage />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      const links = screen.getAllByRole("link", { name: /manage/i });
      expect(links.some((link) => link.getAttribute("href") === `/admin/zone/${zone.id}`)).toBe(true);
    }
  });
});
