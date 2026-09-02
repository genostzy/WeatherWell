import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import AdminPage from "./page";

const TOTAL_SIMULATION_MS = 1500 + 1500 + 2000 + 1500 + 1500 + 1500 + 1500;

describe("AdminPage simulation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts idle, with no reset button and the start action enabled", () => {
    render(<AdminPage />);
    expect(screen.getByRole("button", { name: /start simulation/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("shows a cascade step for the default zone, which has downstream impact", () => {
    render(<AdminPage />);
    expect(screen.getByText("Cascade Warning")).toBeInTheDocument();
  });

  it("runs the alert flow to completion and offers to run again", () => {
    render(<AdminPage />);
    act(() => {
      screen.getByRole("button", { name: /start simulation/i }).click();
    });
    act(() => {
      vi.advanceTimersByTime(TOTAL_SIMULATION_MS);
    });
    expect(screen.getByRole("button", { name: /run again/i })).toBeInTheDocument();
  });

  it("resets back to idle after a completed run", () => {
    render(<AdminPage />);
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
