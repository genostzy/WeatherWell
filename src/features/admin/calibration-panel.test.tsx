import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { CalibrationPanel } from "./calibration-panel";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

const [first, second] = FIXTURE_REFERENCE_DATA.zones;
const now = new Date().toISOString();

describe("CalibrationPanel (Stage 4 Task 3: each prediction against what happened)", () => {
  it("lists barangays whose bar was raised, with the bar they now need", () => {
    renderWithData(<CalibrationPanel bars={{ [first.id]: 1 }} events={[]} />);
    expect(screen.getByText(first.name).closest("li")).toHaveTextContent(/4 located reporters.*trust 1\.25/i);
  });

  it("lists each outcome against the advisory, with any change of bar", () => {
    renderWithData(
      <CalibrationPanel
        bars={{}}
        events={[
          { id: 2, zoneId: second.id, kind: "missed", stepBefore: 1, stepAfter: 0, occurredAt: now },
          { id: 1, zoneId: first.id, kind: "rejected", stepBefore: 0, stepAfter: 1, occurredAt: now },
        ]}
      />
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(second.name);
    expect(items[0]).toHaveTextContent(/missed/i);
    expect(items[0]).toHaveTextContent(/bar lowered to 3 reporters/i);
    expect(items[1]).toHaveTextContent(/rejected/i);
    expect(items[1]).toHaveTextContent(/bar raised to 4 reporters/i);
  });

  it("says plainly when there is no outcome yet", () => {
    renderWithData(<CalibrationPanel bars={{}} events={[]} />);
    expect(screen.getByText(/no outcomes yet/i)).toBeInTheDocument();
  });
});
