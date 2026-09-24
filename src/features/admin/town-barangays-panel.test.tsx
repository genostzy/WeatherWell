import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { TownBarangaysPanel } from "./town-barangays-panel";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import type { AlertRecord } from "@/lib/types";

const zones = FIXTURE_REFERENCE_DATA.zones;
const [first, second] = zones;

const alertOn = (zoneId: string): AlertRecord => ({
  id: `a-${zoneId}`,
  zoneId,
  severity: "red",
  message: { en: "x", fil: "x" },
  source: "manual",
  confidence: "validated",
  issuedAt: new Date().toISOString(),
  isActive: true,
});

describe("TownBarangaysPanel (a municipal official's barangays at a glance)", () => {
  it("lists every barangay with its alert, centre and official, and a way to manage it", () => {
    renderWithData(
      <TownBarangaysPanel zones={zones} officials={[{ userId: "u1", displayName: "Kap Nilo", areaCode: first.psgcBarangayCode }]} />,
      { alerts: [] }
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(zones.length);
    const firstRow = rows.find((r) => within(r).queryByText(first.name))!;
    expect(within(firstRow).getByText(/kap nilo/i)).toBeInTheDocument();
    expect(within(firstRow).getByRole("link", { name: /manage/i })).toHaveAttribute("href", `/admin/zone/${first.id}`);
    const secondRow = rows.find((r) => within(r).queryByText(second.name))!;
    expect(within(secondRow).getByText(/no barangay official/i)).toBeInTheDocument();
    expect(within(secondRow).getByText(/no alert/i)).toBeInTheDocument();
  });

  it("puts barangays under alert first", () => {
    renderWithData(<TownBarangaysPanel zones={zones} officials={[]} />, { alerts: [alertOn(second.id)] });
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText(second.name)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/warning/i)).toBeInTheDocument();
  });

  it("counts how many barangays still have no official", () => {
    renderWithData(<TownBarangaysPanel zones={zones} officials={[]} />, { alerts: [] });
    expect(screen.getByText(new RegExp(`${zones.length} of ${zones.length} barangays have no official`, "i"))).toBeInTheDocument();
  });
});
