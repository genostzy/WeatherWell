import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangeBarangayDialog } from "./change-barangay-dialog";
import { getSelectedZoneId, markConsented } from "@/features/onboarding/onboarding-storage";
import { FIXTURE_REFERENCE_DATA, renderWithData } from "@/test-utils/render-with-data";
import { mockZoneApis } from "@/test-utils/mock-zone-apis";

const followEmailAlerts = vi.fn(async () => {});
vi.mock("@/lib/follow-email-alerts", () => ({ followEmailAlerts: (zoneId: string) => followEmailAlerts(zoneId) }));

const ZONES = FIXTURE_REFERENCE_DATA.zones;
const target = ZONES[1];

async function pick(query: string, zoneName: string) {
  await userEvent.type(screen.getByRole("textbox", { name: /search barangay/i }), query);
  const option = (await screen.findByText(zoneName)).closest("[role='option']") as HTMLElement;
  fireEvent.mouseDown(option);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.localStorage.clear();
  markConsented();
  window.localStorage.setItem("weatherwell.selectedZoneId", ZONES[0].id);
  mockZoneApis(ZONES);
});

describe("ChangeBarangayDialog", () => {
  it("makes the picked barangay mine and says alerts follow it", async () => {
    const onClose = vi.fn();
    renderWithData(<ChangeBarangayDialog onClose={onClose} />);

    await pick("Mangaldan", target.name);
    await userEvent.click(screen.getByRole("button", { name: /make this my barangay/i }));

    expect(getSelectedZoneId()).toBe(target.id);
    expect(followEmailAlerts).toHaveBeenCalledWith(target.id);
    expect(screen.getByText(`Alerts now come for ${target.name}.`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^done$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("says so when the phone can't keep it", async () => {
    renderWithData(<ChangeBarangayDialog onClose={() => {}} />);
    await pick("Mangaldan", target.name);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    await userEvent.click(screen.getByRole("button", { name: /make this my barangay/i }));

    expect(screen.getByText(/couldn't save this on this phone/i)).toBeInTheDocument();
    expect(screen.queryByText(/alerts now come for/i)).not.toBeInTheDocument();
    expect(followEmailAlerts).not.toHaveBeenCalled();
  });
});
