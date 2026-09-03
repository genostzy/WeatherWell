import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import AdminSimulationPage from "./page";

const TOTAL_SIMULATION_MS = 1500 + 1500 + 2000 + 1500 + 1500 + 1500 + 1500;

describe("AdminSimulationPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts idle, with no reset button and the start action enabled", () => {
    render(<AdminSimulationPage />);
    expect(screen.getByRole("button", { name: /start simulation/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("shows a cascade step for the default zone, which has downstream impact", () => {
    render(<AdminSimulationPage />);
    expect(screen.getByText("Cascade Warning")).toBeInTheDocument();
  });

  it("runs the alert flow to completion and offers to run again", () => {
    render(<AdminSimulationPage />);
    act(() => {
      screen.getByRole("button", { name: /start simulation/i }).click();
    });
    act(() => {
      vi.advanceTimersByTime(TOTAL_SIMULATION_MS);
    });
    expect(screen.getByRole("button", { name: /run again/i })).toBeInTheDocument();
  });

  it("resets back to idle after a completed run", () => {
    render(<AdminSimulationPage />);
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
});
