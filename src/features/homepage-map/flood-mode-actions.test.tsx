import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth/anonymous-session", () => ({
  ensureAnonymousSession: async () => null,
  useSessionUserId: () => null,
}));
import { screen } from "@testing-library/react";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { FloodModeActions } from "./flood-mode-actions";
import type { AlertRecord } from "@/lib/types";
import type { Severity } from "@/lib/severity";

const zone = FIXTURE_REFERENCE_DATA.zones[0];
const alert = (severity: Severity): AlertRecord => ({
  id: "a1",
  zoneId: zone.id,
  severity,
  message: { en: "x", fil: "x" },
  source: "manual",
  confidence: "validated",
  issuedAt: new Date().toISOString(),
  isActive: true,
});

describe("FloodModeActions (flood mode: the two things to do, big, when it is serious)", () => {
  it("at Evacuate, offers going to the centre and calling for help", () => {
    renderWithData(<FloodModeActions zone={zone} />, { alerts: [alert("evacuate")] });
    expect(screen.getByRole("link", { name: /go to evacuation centre/i })).toHaveAttribute("href", "/evacuation");
    expect(screen.getByRole("link", { name: /call/i }).getAttribute("href")).toMatch(/^tel:/);
  });

  it("at Warning too", () => {
    renderWithData(<FloodModeActions zone={zone} />, { alerts: [alert("red")] });
    expect(screen.getByRole("link", { name: /go to evacuation centre/i })).toBeInTheDocument();
  });

  it("stays out of the way for an advisory, a watch, or no alert", () => {
    for (const alerts of [[alert("yellow")], [alert("orange")], []]) {
      const { container, unmount } = renderWithData(<FloodModeActions zone={zone} />, { alerts });
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("calls 911 when the barangay has no verified hotline", () => {
    renderWithData(<FloodModeActions zone={{ ...zone, hotlineNumber: "00000000000" }} />, { alerts: [alert("evacuate")] });
    expect(screen.getByRole("link", { name: /call 911/i })).toHaveAttribute("href", "tel:911");
  });

  it("lets the resident say they are safe or need help, right there (officials see the headcount)", () => {
    renderWithData(<FloodModeActions zone={zone} />, { alerts: [alert("evacuate")] });
    expect(screen.getByRole("button", { name: /i.m safe/i })).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: /need help/i })).toBeInTheDocument();
  });
});
