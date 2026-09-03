import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TyphoonTrackingPanel } from "./typhoon-tracking-panel";
import { MOCK_TYPHOON } from "@/lib/mock-data";

describe("TyphoonTrackingPanel", () => {
  it("shows the active system's name, distance, and ETA", () => {
    render(<TyphoonTrackingPanel />);
    expect(MOCK_TYPHOON).not.toBeNull();
    expect(screen.getByText(MOCK_TYPHOON!.name)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${MOCK_TYPHOON!.distanceKm}km`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${MOCK_TYPHOON!.etaHours}`))).toBeInTheDocument();
  });
});
