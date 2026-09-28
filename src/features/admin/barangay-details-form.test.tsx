import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

// A "use server" module, reached through useSetBarangayDetails's dynamic import.
const setBarangayDetailsMock = vi.fn();
vi.mock("@/app/actions/set-barangay-details", () => ({
  setBarangayDetails: (...args: unknown[]) => setBarangayDetailsMock(...args),
}));

import { BarangayDetailsForm } from "./barangay-details-form";

const zone = { ...FIXTURE_REFERENCE_DATA.zones[0], hotlineNumber: "0917 123 4567", extraHotlines: [] as string[] };
const saved = {
  id: zone.id,
  hotline_number: "0917 123 4567",
  extra_hotlines: [],
  evacuation_route_text: zone.evacuationRouteText,
};

beforeEach(() => {
  setBarangayDetailsMock.mockReset();
  setBarangayDetailsMock.mockResolvedValue({ ok: true, saved });
});

describe("BarangayDetailsForm", () => {
  it("starts from what residents see now", () => {
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    expect(screen.getByLabelText("Hotline 1")).toHaveValue("0917 123 4567");
    expect(screen.getByLabelText("Hotline 2")).toHaveValue("");
    expect(screen.getByLabelText("Evacuation instructions (English)")).toHaveValue(zone.evacuationRouteText.en);
  });

  it("saves trimmed numbers, dropping blank ones", async () => {
    const user = userEvent.setup();
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    await user.clear(screen.getByLabelText("Hotline 1"));
    await user.type(screen.getByLabelText("Hotline 1"), " 0917 123 4567 ");
    await user.type(screen.getByLabelText("Hotline 3"), "(075) 522-1234");
    await user.clear(screen.getByLabelText("Evacuation instructions (English)"));
    await user.type(screen.getByLabelText("Evacuation instructions (English)"), "Go to the school.");
    await user.clear(screen.getByLabelText("Evacuation instructions (Filipino)"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(setBarangayDetailsMock).toHaveBeenCalledWith({
      zoneId: zone.id,
      hotlines: ["0917 123 4567", "(075) 522-1234"],
      instructions: { en: "Go to the school.", fil: "" },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved — residents see it the next time their app opens.");
  });

  it("refuses a bad number in the official's language, without sending", async () => {
    const user = userEvent.setup();
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />, { lang: "fil" });
    await user.type(screen.getByLabelText("Hotline 2"), "abc");
    await user.click(screen.getByRole("button", { name: "I-save" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Ang hotline number ay 3 hanggang 20 digit, espasyo at + - ( ).");
    expect(setBarangayDetailsMock).not.toHaveBeenCalled();
  });

  it("refuses blank instructions", async () => {
    const user = userEvent.setup();
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    await user.clear(screen.getByLabelText("Evacuation instructions (English)"));
    await user.clear(screen.getByLabelText("Evacuation instructions (Filipino)"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Write the instructions in English or Filipino.");
    expect(setBarangayDetailsMock).not.toHaveBeenCalled();
  });

  it("sends once when Save is tapped twice", async () => {
    const user = userEvent.setup();
    let finish: (value: unknown) => void = () => {};
    setBarangayDetailsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    renderWithData(<BarangayDetailsForm zone={zone} onClose={() => {}} />);
    const save = screen.getByRole("button", { name: "Save" });
    await user.click(save);
    await user.click(save);

    expect(setBarangayDetailsMock).toHaveBeenCalledTimes(1);
    finish({ ok: true, saved });
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});
