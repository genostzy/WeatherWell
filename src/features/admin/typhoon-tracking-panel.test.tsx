import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TyphoonTrackingPanel } from "./typhoon-tracking-panel";

vi.mock("@/lib/use-typhoon", () => ({
  useTyphoon: vi.fn(() => ({
    track: {
      id: "test-track-1",
      name: "INDAY",
      international_name: "SAOLA",
      category: { en: "Severe Tropical Storm", fil: "Malakas na Bagyong Tropikal" },
      positions: [{ lat: 18.5, lng: 121.3, description: null, outsidePar: false, maxWindsKph: 95, gustinessKph: 115, pressureHpa: 990, movement: { direction: "Westward", speedKph: 20 }, time: "2026-09-18T05:00:00+08:00" }],
      bulletin_number: 12,
      is_final: false,
      issued_at: "2026-09-18T05:00:00+08:00",
      next_bulletin_at: "2026-09-18T11:00:00+08:00",
      headline: "INDAY CONTINUES TO MOVE WESTWARD",
      max_winds_kph: 95,
      gustiness_kph: 115,
      pressure_hpa: 990,
      movement_direction: "Westward",
      movement_speed_kph: 20,
      wind_signal: 2,
      signals: [{ signalLevel: 2, areas: [{ locationName: "Batanes", partialDescriptor: null, raw: "Batanes" }] }],
      source: "html",
      fetched_at: "2026-09-18T05:00:00+08:00",
    },
    isLoading: false,
    error: null,
  })),
}));

describe("TyphoonTrackingPanel", () => {
  it("shows the active system's name and wind signal", () => {
    render(<TyphoonTrackingPanel />);
    expect(screen.getByText("INDAY")).toBeInTheDocument();
    expect(screen.getAllByText(/Signal 2/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows intensity data", () => {
    render(<TyphoonTrackingPanel />);
    expect(screen.getByText(/95/)).toBeInTheDocument();
    expect(screen.getByText(/990/)).toBeInTheDocument();
  });
});

describe("TyphoonTrackingPanel", () => {
  it("shows no active system message when track is null", async () => {
    const { useTyphoon } = await import("@/lib/use-typhoon");
    vi.mocked(useTyphoon).mockReturnValue({
      track: null,
      isLoading: false,
      error: null,
    });
    render(<TyphoonTrackingPanel />);
    expect(screen.getByText(/No active tropical cyclone/)).toBeInTheDocument();
  });
});
