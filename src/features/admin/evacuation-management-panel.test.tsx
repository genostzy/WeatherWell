import { describe, it, expect, vi, beforeEach } from "vitest";
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
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

beforeEach(() => {
  setCenterStatusMock.mockClear();
  setCenterOccupancyMock.mockClear();
});

describe("EvacuationManagementPanel", () => {
  it("summarizes capacity across zones in the donut's center label", () => {
    // 3 of the 4 mock zones default to space_available.
    render(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
    expect(screen.getByText("3/4")).toBeInTheDocument();
  });

  it("lists every zone's evacuation center and a callable hotline", () => {
    render(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);
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
    render(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);

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
    render(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);

    const select = screen.getByRole("combobox", { name: new RegExp(`Capacity — ${zone.name}`) });
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Full" }));

    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
  });

  it("writes a headcount and tells the admin when that write fails", async () => {
    setCenterOccupancyMock.mockResolvedValueOnce({ ok: false, permanent: true, error: "boom" });
    const zone = FIXTURE_REFERENCE_DATA.zones[0];
    render(<EvacuationManagementPanel zones={FIXTURE_REFERENCE_DATA.zones} />);

    const input = screen.getByLabelText(new RegExp(`Headcount \\(of ${zone.evacuationCenterCapacity}`, "i"));
    fireEvent.change(input, { target: { value: "120" } });

    await waitFor(() => expect(setCenterOccupancyMock).toHaveBeenCalledWith({ zoneId: zone.id, occupancy: 120 }));
    expect(await screen.findByText(/could not save/i)).toBeInTheDocument();
  });
});
