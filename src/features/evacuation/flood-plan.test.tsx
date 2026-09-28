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

describe("FloodPlan: every number the barangay lists", () => {
  const listed = { ...zone, hotlineNumber: "0917 123 4567", extraHotlines: ["(075) 522-1234"] };
  const steps = "1. Take the river road.\n2. Cross at the bridge.";

  it("lists every hotline number", () => {
    renderWithData(<FloodPlan zoneId={listed.id} />, { data: { zones: [listed] } });
    expect(screen.getByText("0917 123 4567")).toBeInTheDocument();
    expect(screen.getByText("(075) 522-1234")).toBeInTheDocument();
  });

  it("keeps the official's line breaks", () => {
    renderWithData(<FloodPlan zoneId={listed.id} />, {
      data: { zones: [{ ...listed, evacuationRouteText: { en: steps, fil: steps } }] },
    });
    expect(screen.getByText(/take the river road/i)).toHaveClass("whitespace-pre-line");
  });
});

describe("FloodPlan: the official's instructions", () => {
  it("shows the official's instructions even before the barangay has a centre", () => {
    const noCentre = {
      ...zone,
      evacuationCenterLat: zone.lat,
      evacuationCenterLng: zone.lng,
      evacuationCenterCapacity: 0,
      evacuationRouteText: { en: "Go to the chapel.", fil: "Pumunta sa kapilya." },
    };
    renderWithData(<FloodPlan zoneId={noCentre.id} />, { data: { zones: [noCentre] } });
    expect(screen.getByText("Go to the chapel.")).toBeInTheDocument();
  });

  it("marks instructions written only in Filipino as Filipino on an English plan", () => {
    const filipinoOnly = { ...zone, evacuationRouteText: { en: "", fil: "Pumunta sa kapilya." } };
    renderWithData(<FloodPlan zoneId={filipinoOnly.id} />, { data: { zones: [filipinoOnly] } });
    expect(screen.getByText("Pumunta sa kapilya.")).toHaveAttribute("lang", "fil");
  });
});
