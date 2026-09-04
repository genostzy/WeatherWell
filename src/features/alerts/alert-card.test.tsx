import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertCard } from "./alert-card";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { MOCK_ZONES, MOCK_ALERTS } from "@/lib/mock-data";

const zone = MOCK_ZONES[0];
const alert = MOCK_ALERTS[0];

describe("AlertCard", () => {
  it("shows the zone name, severity, and English message by default", () => {
    render(<AlertCard alert={alert} zone={zone} />);
    expect(screen.getByText(zone.name)).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText(alert.message.en)).toBeInTheDocument();
  });

  it("shows the Filipino message when that language is active", () => {
    render(
      <LanguageProvider initialLang="fil">
        <AlertCard alert={alert} zone={zone} />
      </LanguageProvider>
    );
    expect(screen.getByText(alert.message.fil)).toBeInTheDocument();
    expect(screen.queryByText(alert.message.en)).not.toBeInTheDocument();
  });

  it("tags localized copy with its language for screen readers", () => {
    render(
      <LanguageProvider initialLang="fil">
        <AlertCard alert={alert} zone={zone} />
      </LanguageProvider>
    );
    expect(screen.getByText(alert.message.fil)).toHaveAttribute("lang", "fil");
  });

  it("shows a 'no active alert' state when there is no alert", () => {
    render(<AlertCard alert={undefined} zone={MOCK_ZONES[2]} />);
    expect(screen.getByText(/no active alert/i)).toBeInTheDocument();
  });
});
