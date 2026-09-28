import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { FIXTURE_REFERENCE_DATA, renderWithData } from "@/test-utils/render-with-data";
import type { AlertRecord } from "@/lib/types";

let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => params }));
vi.mock("@/features/evacuation/check-in-panel", () => ({
  CheckInPanel: ({ zoneId }: { zoneId: string }) => <p>check-in:{zoneId}</p>,
}));
vi.mock("@/features/evacuation/candidate-sites", () => ({ CandidateSites: () => null }));
// Records the barangay it was mounted for: its answer must not outlive a change of barangay.
vi.mock("@/features/evacuation/elevation-check", () => ({
  ElevationCheck: ({ zoneId }: { zoneId: string }) => {
    const [mountedFor] = useState(zoneId);
    return <p>elevation-for:{mountedFor}</p>;
  },
}));

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

  it("says a viewed barangay's evacuation isn't mine, with the way back to mine", async () => {
    params = new URLSearchParams(`zone=${other.id}`);
    renderWithData(<EvacuationPage />, { alerts: [] });
    expect(await screen.findByText(`Viewing ${other.name}. Your alerts still come for ${mine.name}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to my barangay/i })).toHaveAttribute("href", "/evacuation");
  });

  it("starts How high am I? afresh when the barangay changes", async () => {
    params = new URLSearchParams(`zone=${other.id}`);
    function Harness() {
      const [, rerender] = useState(0);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              params = new URLSearchParams();
              rerender(1);
            }}
          >
            back
          </button>
          <EvacuationPage />
        </>
      );
    }
    renderWithData(<Harness />, { alerts: [] });
    expect(await screen.findByText(`elevation-for:${other.id}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "back" }));
    expect(await screen.findByText(`elevation-for:${mine.id}`)).toBeInTheDocument();
  });

  it("shows the viewed barangay, without a check-in, which is for your own", async () => {
    params = new URLSearchParams(`zone=${other.id}`);
    renderWithData(<EvacuationPage />, { alerts: [dangerous(other.id)] });
    expect(await screen.findByRole("heading", { level: 1, name: new RegExp(other.name) })).toBeInTheDocument();
    expect(screen.queryByText(/check-in:/)).not.toBeInTheDocument();
  });
});
