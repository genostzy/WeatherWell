import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoverageNote } from "./coverage-note";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";

const covered = { ...FIXTURE_REFERENCE_DATA.zones[0], hotlineNumber: "09171234567" };
const placeholder = {
  ...covered,
  hotlineNumber: "00000000000",
  evacuationCenterLat: covered.lat,
  evacuationCenterLng: covered.lng,
  evacuationCenterCapacity: 0,
};

describe("CoverageNote", () => {
  it("says nothing for a barangay with a real hotline and centre", () => {
    const { container } = render(<CoverageNote zone={covered} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("labels a placeholder barangay as alerts-only", () => {
    render(<CoverageNote zone={placeholder} />);
    expect(screen.getByText(/alerts only/i)).toBeInTheDocument();
  });

  it("labels it when only the hotline is missing, too", () => {
    render(<CoverageNote zone={{ ...covered, hotlineNumber: "0000" }} />);
    expect(screen.getByText(/alerts only/i)).toBeInTheDocument();
  });

  it("speaks Filipino", () => {
    render(
      <LanguageProvider initialLang="fil">
        <CoverageNote zone={placeholder} />
      </LanguageProvider>
    );
    expect(screen.getByText(/alerto lamang/i)).toHaveAttribute("lang", "fil");
  });
});
