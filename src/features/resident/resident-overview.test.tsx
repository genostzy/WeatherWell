import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { ResidentOverview } from "./resident-overview";

describe("ResidentOverview", () => {
  it("renders the counts and zone name in English by default", () => {
    render(
      <ResidentOverview zoneName="Barangay Nilombot" reportCount={3} checkInCount={1} pinCount={2} />
    );

    expect(screen.getByText("Zone: Barangay Nilombot")).toBeInTheDocument();
    expect(screen.getByText("My Dashboard")).toBeInTheDocument();
  });

  it("renders fully in Filipino, including the no-zone fallback", () => {
    render(
      <LanguageProvider initialLang="fil">
        <ResidentOverview zoneName={null} reportCount={0} checkInCount={0} pinCount={0} />
      </LanguageProvider>
    );

    expect(screen.getByText("Aking Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Zone: Walang napiling zone")).toBeInTheDocument();
    expect(screen.getByText("Mga Ulat")).toBeInTheDocument();
    expect(screen.getByText("Mga Check-in")).toBeInTheDocument();
    expect(screen.getByText("Mga Pin")).toBeInTheDocument();
  });
});
