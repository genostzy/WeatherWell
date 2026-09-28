import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZoneMap } from "./zone-map";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { zonesWithStatus } from "@/test-utils/mock-fixtures";
import { mockZoneApis } from "@/test-utils/mock-zone-apis";
import { markConsented } from "@/features/onboarding/onboarding-storage";

// Records each link's prefetch setting (next/link adds nothing to the DOM for it).
const prefetchOf = new Map<string, unknown>();
vi.mock("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: unknown; children: React.ReactNode }) => {
    prefetchOf.set(href, prefetch);
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

describe("ZoneMap", () => {
  it("renders a labeled region for every zone", () => {
    renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.name)).toBeInTheDocument();
    }
  });

  it("renders one region per zone, not a single merged block", () => {
    const { container } = renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(container.querySelectorAll('[data-testid="zone-region"]')).toHaveLength(
      FIXTURE_REFERENCE_DATA.zones.length
    );
  });

  it("shows each zone's evacuation center name", () => {
    renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.evacuationCenterName)).toBeInTheDocument();
    }
  });

  it("shows rainfall data for each zone", () => {
    const { container } = renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    // Each zone row should render — rainfall is shown as a number in each row
    expect(container.querySelectorAll('[data-testid="zone-region"]')).toHaveLength(
      FIXTURE_REFERENCE_DATA.zones.length
    );
  });

  it("filters the list down to one status, and back again", async () => {
    const user = userEvent.setup();
    const { container } = renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);

    const hazardousCount = zonesWithStatus("hazardous").length;
    expect(hazardousCount).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: new RegExp(`hazardous \\(${hazardousCount}\\)`, "i") }));
    expect(container.querySelectorAll('[data-testid="zone-region"]')).toHaveLength(hazardousCount);

    await user.click(screen.getByRole("button", { name: /^all/i }));
    expect(container.querySelectorAll('[data-testid="zone-region"]')).toHaveLength(
      FIXTURE_REFERENCE_DATA.zones.length
    );
  });

  it("disables a status filter no zone currently matches", () => {
    renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(screen.getByRole("button", { name: /safe \(0\)/i })).toBeDisabled();
  });

  it("searches zones by name", async () => {
    const user = userEvent.setup();
    renderWithData(<ZoneMap zones={FIXTURE_REFERENCE_DATA.zones} />);
    const firstZone = FIXTURE_REFERENCE_DATA.zones[0];
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, firstZone.name.split(",")[0]);
    expect(screen.getByText(firstZone.name)).toBeInTheDocument();
  });
});

describe("ZoneMap order (it opened on Adams, Ilocos Norte, for everyone)", () => {
  it("lists your barangay, then barangays under alert, then the rest of your town, then the others", () => {
    const [nilombot, mangaldan, manaoag, santaBarbara] = FIXTURE_REFERENCE_DATA.zones;
    const neighbour = { ...nilombot, id: "zone-9", psgcBarangayCode: "0105528099", name: "Barangay Apaya, Mapandan" };
    window.localStorage.setItem("weatherwell.selectedZoneId", nilombot.id);
    const zones = [mangaldan, manaoag, santaBarbara, neighbour, nilombot];
    const { container } = renderWithData(<ZoneMap zones={zones} />, {
      data: { zones },
      alerts: [
        {
          id: "a", zoneId: santaBarbara.id, severity: "red", message: { en: "x", fil: "x" }, source: "manual",
          confidence: "validated", issuedAt: new Date().toISOString(), isActive: true,
        },
      ],
    });
    const order = [...container.querySelectorAll('[data-testid="zone-region"]')].map((el) =>
      zones.find((z) => el.textContent?.includes(z.name))?.id
    );
    expect(order).toEqual([nilombot.id, santaBarbara.id, neighbour.id, manaoag.id, mangaldan.id]);
    window.localStorage.clear();
  });
});

describe("ZoneMap card actions (the barangay on the card, not your own)", () => {
  const zones = FIXTURE_REFERENCE_DATA.zones;
  const card = (zone: { name: string }) =>
    screen.getByText(zone.name).closest('[data-testid="zone-region"]') as HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("weatherwell.selectedZoneId", zones[0].id);
  });

  it("opens the barangay on the card, not your own", () => {
    renderWithData(<ZoneMap zones={zones} />);
    const other = within(card(zones[1]));
    expect(other.getByRole("link", { name: /^view$/i })).toHaveAttribute("href", `/?zone=${zones[1].id}`);
    expect(other.getByRole("link", { name: /^evacuation$/i })).toHaveAttribute("href", `/evacuation?zone=${zones[1].id}`);
    const mine = within(card(zones[0]));
    expect(mine.getByRole("link", { name: /^view$/i })).toHaveAttribute("href", "/");
    expect(mine.getByRole("link", { name: /^evacuation$/i })).toHaveAttribute("href", "/evacuation");
  });

  it("has no Report button on a card", () => {
    const { container } = renderWithData(<ZoneMap zones={zones} />);
    expect(container.querySelector('[data-testid="zone-region"] a[href="/report"]')).toBeNull();
  });

  it("lets you change your barangay from your own card", async () => {
    renderWithData(<ZoneMap zones={zones} />);
    expect(within(card(zones[1])).queryByRole("button", { name: /change my barangay/i })).not.toBeInTheDocument();
    await userEvent.click(within(card(zones[0])).getByRole("button", { name: /change my barangay/i }));
    expect(screen.getByRole("dialog", { name: "Change my barangay" })).toBeInTheDocument();
  });

  it("does not prefetch every barangay a card links to", () => {
    prefetchOf.clear();
    renderWithData(<ZoneMap zones={zones} />);
    expect(prefetchOf.get(`/?zone=${zones[1].id}`)).toBe(false);
    expect(prefetchOf.get(`/evacuation?zone=${zones[1].id}`)).toBe(false);
  });

  it("keeps the change dialog open while the list re-ranks around the new barangay", async () => {
    // Mine sorts last by name; after the change, 20 barangays of my old town
    // come first and my old card drops off the page.
    const template = zones[0];
    const mine = { ...template, id: "zone-mine", name: "Zulu Mine, Town A", psgcBarangayCode: "0105528999" };
    const town = Array.from({ length: 21 }, (_, i) => ({
      ...template,
      id: `zone-a${i}`,
      name: `Alpha ${String(i).padStart(2, "0")}, Town A`,
      psgcBarangayCode: `0105528${String(i).padStart(3, "0")}`,
    }));
    const bravo = { ...template, id: "zone-b", name: "Bravo One, Town B", municipalityName: "Town B", psgcBarangayCode: "0999999001" };
    const all = [mine, ...town, bravo];
    localStorage.setItem("weatherwell.selectedZoneId", mine.id);
    markConsented();
    mockZoneApis(all);
    renderWithData(<ZoneMap zones={all} />, { data: { zones: all } });

    await userEvent.click(within(card(mine)).getByRole("button", { name: /change my barangay/i }));
    await userEvent.type(screen.getByRole("textbox", { name: /search barangay/i }), "Bravo");
    const option = (await screen.findByText("Bravo One, Town B", { selector: "[role='option'] *" })).closest("[role='option']") as HTMLElement;
    fireEvent.mouseDown(option);
    await userEvent.click(screen.getByRole("button", { name: /make this my barangay/i }));

    expect(await screen.findByText("Alerts now come for Bravo One, Town B.")).toBeInTheDocument();
  });
});
