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
});
