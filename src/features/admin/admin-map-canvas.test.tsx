import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdminMapCanvas } from "./admin-map-canvas";
import { MOCK_ZONES } from "@/lib/mock-data";
import { addCommunityPin, type CommunityPin } from "@/lib/community-pins";

/**
 * Same shallow approach as MapCanvas's own test: jsdom has no layout engine,
 * so this checks that the admin controls render and that using one actually
 * writes to the store behind it — not that Leaflet's pixel math is right.
 *
 * Marker popups only render once opened, so each test clicks the marker
 * (exposed as role="img" carrying the icon's aria-label) before querying the
 * control inside it.
 */
function storedOverrides(): Record<string, { alertSeverity?: string; currentOccupancy?: number }> {
  const raw = localStorage.getItem("weatherwell.zoneOverrides");
  return raw ? JSON.parse(raw) : {};
}

function storedPins(): CommunityPin[] {
  const raw = localStorage.getItem("weatherwell.communityPins");
  return raw ? JSON.parse(raw) : [];
}

function seedPin(overrides: Partial<CommunityPin> = {}): void {
  addCommunityPin({
    zoneId: "zone-1",
    statusTag: "flooded",
    caption: "Test pin",
    lat: MOCK_ZONES[0].lat,
    lng: MOCK_ZONES[0].lng,
  });
  if (Object.keys(overrides).length > 0) {
    const pins = storedPins();
    localStorage.setItem("weatherwell.communityPins", JSON.stringify([{ ...pins[0], ...overrides }]));
  }
}

const zone = MOCK_ZONES[0];

describe("AdminMapCanvas", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("weatherwell.communityPins", "[]");
  });

  it("renders the legend, hazard selector, and layer toggles", () => {
    render(<AdminMapCanvas zones={MOCK_ZONES} />);
    expect(screen.getByText(/map legend/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /flood/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /community pins/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /cascade chain/i })).toBeChecked();
  });

  it("writes a severity override when an admin picks one from a zone popup", () => {
    render(<AdminMapCanvas zones={MOCK_ZONES} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.name, "i") }));

    fireEvent.change(screen.getByRole("combobox", { name: new RegExp(zone.name, "i") }), {
      target: { value: "evacuate" },
    });

    expect(storedOverrides()[zone.id]?.alertSeverity).toBe("evacuate");
  });

  it("clears the override back to automatic", () => {
    render(<AdminMapCanvas zones={MOCK_ZONES} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.name, "i") }));
    const select = screen.getByRole("combobox", { name: new RegExp(zone.name, "i") });

    fireEvent.change(select, { target: { value: "evacuate" } });
    fireEvent.change(select, { target: { value: "auto" } });

    // "auto" means no override at all, not an override whose value is "auto".
    expect(storedOverrides()[zone.id]?.alertSeverity).toBeUndefined();
  });

  it("shows the zone's computed risk score alongside the override control", () => {
    render(<AdminMapCanvas zones={MOCK_ZONES} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.name, "i") }));

    expect(screen.getByText(/risk score/i)).toBeInTheDocument();
    expect(screen.getByText(/advisory only/i)).toBeInTheDocument();
  });

  it("writes an evacuation center headcount from its marker popup", () => {
    render(<AdminMapCanvas zones={MOCK_ZONES} />);
    fireEvent.click(screen.getByRole("img", { name: new RegExp(zone.evacuationCenterName, "i") }));

    fireEvent.change(
      screen.getByRole("spinbutton", { name: new RegExp(zone.evacuationCenterName, "i") }),
      { target: { value: "120" } }
    );

    expect(storedOverrides()[zone.id]?.currentOccupancy).toBe(120);
  });

  it("removes a community pin from its popup", () => {
    seedPin();
    render(<AdminMapCanvas zones={MOCK_ZONES} />);

    fireEvent.click(screen.getByRole("img", { name: /flooded/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove pin/i }));

    expect(storedPins()[0].removed).toBe(true);
    expect(storedPins()[0].removedReason).toBe("admin");
  });

  it("keeps an already-removed pin on the map so it can be restored", () => {
    // The whole point of the soft delete — a pin taken down by brigading
    // votes has to stay reachable for an admin to bring back.
    seedPin({ removed: true, removedReason: "net_score" });
    render(<AdminMapCanvas zones={MOCK_ZONES} />);

    fireEvent.click(screen.getByRole("img", { name: /removed/i }));
    fireEvent.click(screen.getByRole("button", { name: /restore pin/i }));

    expect(storedPins()[0].removed).toBe(false);
  });

  it("hides the pin layer when its toggle is unchecked", () => {
    seedPin();
    render(<AdminMapCanvas zones={MOCK_ZONES} />);
    expect(screen.getByRole("img", { name: /flooded/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /community pins/i }));

    expect(screen.queryByRole("img", { name: /flooded/i })).not.toBeInTheDocument();
  });
});
