import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setCenterStatusMock = vi.fn().mockResolvedValue({ ok: true });
const setCenterOccupancyMock = vi.fn().mockResolvedValue({ ok: true });

// set-center.ts is a "use server" module that pulls in user-server.ts, which
// does `import "server-only"` — that throws unconditionally outside a real
// server bundler. EvacuationManagementPanel only ever reaches it through a
// dynamic import inside EvacuationCenterRow's change handlers, so this mock
// exists for the tests that fire one.
vi.mock("@/app/actions/set-center", () => ({
  setCenterStatus: (...args: unknown[]) => setCenterStatusMock(...args),
  setCenterOccupancy: (...args: unknown[]) => setCenterOccupancyMock(...args),
}));

import { EvacuationManagementPanel } from "./evacuation-management-panel";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import type { Official } from "@/lib/auth/official";
import { OfficialContext } from "@/lib/auth/official-context";
import { ReferenceDataProvider } from "@/lib/reference-data/provider";
import { useZones } from "@/lib/reference-data/use-reference-data";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

beforeEach(() => {
  setCenterStatusMock.mockClear();
  setCenterOccupancyMock.mockClear();
});

describe("EvacuationManagementPanel", () => {
  it("summarizes capacity across zones in the donut's center label", () => {
    // 3 of the 4 mock zones default to space_available.
    renderWithData(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(screen.getByText("3/4")).toBeInTheDocument();
  });

  it("lists every zone's evacuation center and a callable hotline", () => {
    renderWithData(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    for (const zone of FIXTURE_REFERENCE_DATA.zones) {
      expect(screen.getByText(zone.evacuationCenterName)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: zone.hotlineNumber })).toHaveAttribute(
        "href",
        `tel:${zone.hotlineNumber}`
      );
    }
  });

  it("writes a zone's capacity status when an admin picks one", async () => {
    // Status now writes straight to evacuation_centers.status (setCenterStatus)
    // rather than a local store the whole panel re-read synchronously, so
    // what this test can assert is that the write happens with the right
    // arguments — not an instant, storeless reflection in the donut summary,
    // which nothing here re-fetches.
    const user = userEvent.setup();
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    renderWithData(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);

    const select = screen.getByRole("combobox", { name: new RegExp(`Capacity — ${zone.name}`) });
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Full" }));

    await waitFor(() =>
      expect(setCenterStatusMock).toHaveBeenCalledWith({ zoneId: zone.id, status: "full" })
    );
  });

  it("tells the admin when a capacity write fails", async () => {
    setCenterStatusMock.mockResolvedValueOnce({ ok: false, permanent: true, error: "boom" });
    const user = userEvent.setup();
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    renderWithData(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);

    const select = screen.getByRole("combobox", { name: new RegExp(`Capacity — ${zone.name}`) });
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Full" }));

    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
  });

  it("writes a typed headcount of 120 once when the field is left, not once per keystroke (M9)", async () => {
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    renderWithData(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);

    const input = screen.getByLabelText(new RegExp(`Headcount \\(of ${zone.evacuationCenterCapacity}`, "i"));
    for (const value of ["1", "12", "120"]) fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);

    await waitFor(() => expect(setCenterOccupancyMock).toHaveBeenCalledWith({ zoneId: zone.id, occupancy: 120 }));
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(setCenterOccupancyMock).toHaveBeenCalledTimes(1);
  });

  it("writes a headcount and tells the admin when that write fails", async () => {
    setCenterOccupancyMock.mockResolvedValueOnce({ ok: false, permanent: true, error: "boom" });
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    renderWithData(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);

    const input = screen.getByLabelText(new RegExp(`Headcount \\(of ${zone.evacuationCenterCapacity}`, "i"));
    fireEvent.change(input, { target: { value: "120" } });

    await waitFor(() => expect(setCenterOccupancyMock).toHaveBeenCalledWith({ zoneId: zone.id, occupancy: 120 }));
    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
  });

  it("only lists the evacuation center of a zone outside the official's area — it does not appear", () => {
    const [ownZone, otherZone] = FIXTURE_REFERENCE_DATA.zones;
    const official: Official = {
      userId: "u1",
      displayName: "Test",
      areaCode: ownZone.psgcBarangayCode,
      areaName: "Own barangay",
      level: "barangay",
    };
    renderWithData(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />, { official });

    expect(screen.getByText(ownZone.evacuationCenterName)).toBeInTheDocument();
    expect(screen.queryByText(otherZone.evacuationCenterName)).not.toBeInTheDocument();
  });
});

describe("EvacuationManagementPanel capacity control after a confirmed write (R1)", () => {
  // Mounts the real ReferenceDataProvider rather than renderWithData's fixed
  // context value: the defect was that the row's status select read
  // zone.centerStatus from a zone list fetched once and never patched, so a
  // static context cannot show the regression. zones[0] starts
  // "space_available" and is not tracking a headcount, so its select stays
  // enabled here.
  const zone = FIXTURE_REFERENCE_DATA.zones[0];

  const OFFICIAL: Official = {
    userId: "u1",
    displayName: "Test",
    areaCode: zone.psgcBarangayCode,
    areaName: "Own barangay",
    level: "barangay",
  };

  beforeEach(() => {
    localStorage.clear();
    setCenterStatusMock.mockReset();
    setCenterStatusMock.mockResolvedValue({ ok: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/data/reference-data.json") return { ok: true, json: async () => FIXTURE_REFERENCE_DATA };
        if (url.startsWith("/api/alerts")) return { ok: true, json: async () => [] };
        return { ok: true, json: async () => [] };
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setCenterStatusMock.mockReset();
    setCenterStatusMock.mockResolvedValue({ ok: true });
  });

  // EvacuationManagementPanel takes zones as a prop rather than reading
  // useZones() itself (see admin-overview.tsx, its only real caller) — so a
  // live test has to read the zones from the provider the same way, or the
  // provider's own patched copy never reaches the panel.
  function PanelWithLiveZones() {
    const zones = useZones();
    return <EvacuationManagementPanel zones={zones} />;
  }

  function renderLive() {
    return render(
      <TooltipProvider>
        <LanguageProvider>
          <ReferenceDataProvider>
            <OfficialContext.Provider value={OFFICIAL}>
              <PanelWithLiveZones />
            </OfficialContext.Provider>
          </ReferenceDataProvider>
        </LanguageProvider>
      </TooltipProvider>
    );
  }

  it("shows Full once the write is confirmed, then lets the official pick Space available again", async () => {
    const user = userEvent.setup();
    renderLive();

    const select = await screen.findByRole("combobox", { name: new RegExp(`Capacity — ${zone.name}`) });
    expect(select).toHaveTextContent(/space available/i);

    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Full" }));

    await waitFor(() => expect(setCenterStatusMock).toHaveBeenCalledWith({ zoneId: zone.id, status: "full" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: new RegExp(`Capacity — ${zone.name}`) })).toHaveTextContent("Full")
    );

    // "Space available" must be selectable again: while the select still
    // showed Full, picking it fired no change at all.
    await user.click(screen.getByRole("combobox", { name: new RegExp(`Capacity — ${zone.name}`) }));
    await user.click(await screen.findByRole("option", { name: "Space available" }));

    await waitFor(() =>
      expect(setCenterStatusMock).toHaveBeenCalledWith({ zoneId: zone.id, status: "space_available" })
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: new RegExp(`Capacity — ${zone.name}`) })).toHaveTextContent(
        /space available/i
      )
    );
  });

  it("leaves the displayed status unchanged and shows the error when the write fails", async () => {
    setCenterStatusMock.mockResolvedValueOnce({ ok: false, permanent: true, error: "boom" });
    const user = userEvent.setup();
    renderLive();

    const select = await screen.findByRole("combobox", { name: new RegExp(`Capacity — ${zone.name}`) });
    expect(select).toHaveTextContent(/space available/i);

    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Full" }));

    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: new RegExp(`Capacity — ${zone.name}`) })).toHaveTextContent(
      /space available/i
    );
  });
});

describe("EvacuationManagementPanel placeholders (found testing the live site)", () => {
  it("shows no call link for a placeholder hotline", () => {
    const zone = { ...FIXTURE_REFERENCE_DATA.zones[0], hotlineNumber: "00000000000" };
    renderWithData(<EvacuationManagementPanel zones={[zone]} />, { data: { zones: [zone] } });
    expect(document.querySelector('a[href="tel:00000000000"]')).toBeNull();
    expect(screen.getByText(/no verified hotline/i)).toBeInTheDocument();
  });
});

describe("EvacuationManagementPanel placeholders (found checking the live Mapandan dashboard)", () => {
  it("lists only verified centres, and says how many barangays still have none", () => {
    const [real, ...rest] = FIXTURE_REFERENCE_DATA.zones;
    const placeholders = rest.map((z) => ({
      ...z,
      evacuationCenterName: "Evacuation Centre — Test",
      evacuationCenterLat: z.lat,
      evacuationCenterLng: z.lng,
      evacuationCenterCapacity: 0,
    }));
    const zones = [real, ...placeholders];
    renderWithData(<EvacuationManagementPanel zones={zones} />, { data: { zones } });
    expect(screen.getByText(real.evacuationCenterName)).toBeInTheDocument();
    expect(screen.queryByText("Evacuation Centre — Test")).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${placeholders.length} barangays have no verified centre yet`, "i"))).toBeInTheDocument();
    expect(screen.getByText(/1 evacuation centers?/i)).toBeInTheDocument();
  });
});
