import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { FloodPlan } from "./flood-plan";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));

const zone = FIXTURE_REFERENCE_DATA.zones[0];

describe("FloodPlan (a one-page plan to print for the barangay hall)", () => {
  it("says where to go, who to call, what each alert means and what to bring", async () => {
    renderWithData(<FloodPlan zoneId={zone.id} />);
    expect(screen.getByRole("heading", { level: 1, name: new RegExp(zone.name) })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /where to go/i })).toBeInTheDocument();
    expect(screen.getByText(zone.evacuationCenterName)).toBeInTheDocument();
    expect(screen.getByText("911")).toBeInTheDocument();
    for (const level of [/advisory/i, /watch/i, /warning/i, /evacuate now/i]) {
      expect(screen.getAllByText(level).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("heading", { name: /what to bring/i })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: /scan to get alerts/i })).toHaveAttribute("src", "data:image/png;base64,QR");
  });

  it("is honest when the barangay has no verified centre or hotline", () => {
    const bare = { ...zone, evacuationCenterLat: zone.lat, evacuationCenterLng: zone.lng, evacuationCenterCapacity: 0, hotlineNumber: "00000000000" };
    renderWithData(<FloodPlan zoneId={bare.id} />, { data: { zones: [bare] } });
    expect(screen.getByText(/no verified evacuation centre/i)).toBeInTheDocument();
    expect(screen.getByText(/no verified barangay hotline/i)).toBeInTheDocument();
  });

  it("prints", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderWithData(<FloodPlan zoneId={zone.id} />);
    fireEvent.click(screen.getByRole("button", { name: /print/i }));
    expect(print).toHaveBeenCalled();
  });
});

describe("FloodPlanLink", () => {
  it("links to the barangay's printable plan", async () => {
    const { FloodPlanLink } = await import("./flood-plan");
    renderWithData(<FloodPlanLink zoneId="zone-1" />);
    expect(screen.getByRole("link", { name: /print.*flood plan/i })).toHaveAttribute("href", "/plan/zone-1");
  });
});
