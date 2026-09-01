import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeverityBadge } from "./severity-badge";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { SEVERITY_LABEL } from "@/lib/severity";

describe("SeverityBadge", () => {
  it("shows the human-readable label for the severity", () => {
    render(<SeverityBadge severity="red" />);
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("applies the matching severity color class", () => {
    render(<SeverityBadge severity="red" />);
    expect(screen.getByText("Warning")).toHaveClass("bg-severity-red");
  });

  it("uses the evacuate styling for the top severity", () => {
    render(<SeverityBadge severity="evacuate" />);
    expect(screen.getByText("Evacuate Now")).toHaveClass("bg-severity-evacuate");
  });

  it("shows the Filipino label when that language is active", () => {
    render(
      <LanguageProvider initialLang="fil">
        <SeverityBadge severity="evacuate" />
      </LanguageProvider>
    );
    expect(screen.getByText(SEVERITY_LABEL.evacuate.fil)).toBeInTheDocument();
    expect(screen.queryByText(SEVERITY_LABEL.evacuate.en)).not.toBeInTheDocument();
  });

  it("tags the localized label with its language for screen readers", () => {
    render(
      <LanguageProvider initialLang="fil">
        <SeverityBadge severity="red" />
      </LanguageProvider>
    );
    expect(screen.getByText(SEVERITY_LABEL.red.fil)).toHaveAttribute("lang", "fil");
  });
});
