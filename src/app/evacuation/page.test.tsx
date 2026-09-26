import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { FIXTURE_REFERENCE_DATA, renderWithData } from "@/test-utils/render-with-data";
import type { AlertRecord } from "@/lib/types";

let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => params }));
vi.mock("@/features/evacuation/check-in-panel", () => ({
  CheckInPanel: ({ zoneId }: { zoneId: string }) => <p>check-in:{zoneId}</p>,
}));
vi.mock("@/features/evacuation/candidate-sites", () => ({ CandidateSites: () => null }));

import EvacuationPage from "./page";

const [mine, other] = FIXTURE_REFERENCE_DATA.zones;
const dangerous = (zoneId: string): AlertRecord => ({
  id: `a-${zoneId}`,
  zoneId,
  severity: "red",
  message: { en: "Move now", fil: "Lumikas na" },
  source: "manual",
  confidence: "validated",
  issuedAt: new Date().toISOString(),
  isActive: true,
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("weatherwell.selectedZoneId", mine.id);
});

describe("/evacuation (my barangay, or ?zone=)", () => {
  it("shows my barangay without ?zone=", async () => {
    params = new URLSearchParams();
    renderWithData(<EvacuationPage />, { alerts: [dangerous(mine.id)] });
    expect(await screen.findByRole("heading", { level: 1, name: new RegExp(mine.name) })).toBeInTheDocument();
    expect(screen.getByText(`check-in:${mine.id}`)).toBeInTheDocument();
  });

  it("shows the viewed barangay, without a check-in, which is for your own", async () => {
    params = new URLSearchParams(`zone=${other.id}`);
    renderWithData(<EvacuationPage />, { alerts: [dangerous(other.id)] });
    expect(await screen.findByRole("heading", { level: 1, name: new RegExp(other.name) })).toBeInTheDocument();
    expect(screen.queryByText(/check-in:/)).not.toBeInTheDocument();
  });
});
