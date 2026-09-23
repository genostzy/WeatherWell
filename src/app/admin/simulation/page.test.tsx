import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminSimulationPage from "./page";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import type { Official } from "@/lib/auth/official";

const TOTAL_SIMULATION_MS = 1500 + 1500 + 2000 + 1500 + 1500 + 1500 + 1500;

describe("AdminSimulationPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts idle, with no reset button and the start action enabled", () => {
    renderWithData(<AdminSimulationPage />);
    expect(screen.getByRole("button", { name: /start simulation/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("shows a cascade step for the default zone, which has downstream impact", () => {
    renderWithData(<AdminSimulationPage />);
    expect(screen.getByText("Cascade Warning")).toBeInTheDocument();
  });

  it("runs the alert flow to completion and offers to run again", () => {
    renderWithData(<AdminSimulationPage />);
    act(() => {
      screen.getByRole("button", { name: /start simulation/i }).click();
    });
    act(() => {
      vi.advanceTimersByTime(TOTAL_SIMULATION_MS);
    });
    expect(screen.getByRole("button", { name: /run again/i })).toBeInTheDocument();
  });

  it("resets back to idle after a completed run", () => {
    renderWithData(<AdminSimulationPage />);
    act(() => {
      screen.getByRole("button", { name: /start simulation/i }).click();
    });
    act(() => {
      vi.advanceTimersByTime(TOTAL_SIMULATION_MS);
    });
    act(() => {
      screen.getByRole("button", { name: /reset/i }).click();
    });
    expect(screen.getByRole("button", { name: /start simulation/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("only offers zones inside the official's area in the zone picker", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const [ownZone, otherZone] = FIXTURE_REFERENCE_DATA.zones;
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: ownZone.psgcBarangayCode,
      areaName: "Own barangay",
      level: "barangay",
    };
    renderWithData(<AdminSimulationPage />, { official });

    await user.click(screen.getByRole("combobox", { name: /zone/i }));
    expect(await screen.findByRole("option", { name: ownZone.name })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: otherZone.name })).not.toBeInTheDocument();
  });

  it("caps the zone dropdown for an admin instead of rendering every zone nationwide", async () => {
    // Real admin scale is ~42k zones, not the 4-zone fixture set — found live
    // during 2026-09-22-admin-role-and-password-auth's final review, the same
    // class of bug as AdminOverview's nationwide hang. A synthetic 500-zone
    // set here proves the cap without needing 42k fixtures.
    vi.useRealTimers();
    const user = userEvent.setup();
    const base = FIXTURE_REFERENCE_DATA.zones[0];
    const manyZones = Array.from({ length: 500 }, (_, i) => ({
      ...base,
      id: `synthetic-zone-${i}`,
      psgcBarangayCode: String(i).padStart(10, "0"),
      name: `Synthetic Zone ${i}`,
    }));
    const admin: Official = {
      userId: "admin-1",
      displayName: "Test Admin",
      areaCode: "",
      areaName: "All areas",
      level: "admin",
    };
    renderWithData(<AdminSimulationPage />, { official: admin, data: { zones: manyZones } });

    await user.click(screen.getByRole("combobox", { name: /zone/i }));
    const options = await screen.findAllByRole("option");
    expect(options.length).toBeLessThan(manyZones.length);
  });

  it("shows an empty-area notice instead of crashing when the official's area matches zero zones", () => {
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: "9999999999",
      areaName: "Nowhere",
      level: "barangay",
    };
    renderWithData(<AdminSimulationPage />, { official });

    expect(screen.getByText(/no barangays in your area/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start simulation/i })).not.toBeInTheDocument();
  });
});
