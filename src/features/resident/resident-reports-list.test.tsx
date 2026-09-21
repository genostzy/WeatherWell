import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { ResidentReportsList } from "./resident-reports-list";

describe("ResidentReportsList", () => {
  it("shows the depth label and zone name in English by default", () => {
    render(
      <ResidentReportsList
        reports={[{ id: "r1", zoneName: "Barangay Nilombot", depthLevel: "knee", reportedAt: "2026-09-01T00:00:00Z" }]}
      />
    );

    expect(screen.getByText("Knee-deep")).toBeInTheDocument();
    expect(screen.getByText("Barangay Nilombot")).toBeInTheDocument();
  });

  it("renders fully in Filipino, including the empty state", () => {
    render(
      <LanguageProvider initialLang="fil">
        <ResidentReportsList reports={[]} />
      </LanguageProvider>
    );

    expect(screen.getByText("Aking mga Ulat")).toBeInTheDocument();
    expect(screen.getByText(/Wala pang ulat/)).toBeInTheDocument();
  });

  it("translates the depth label in Filipino too", () => {
    render(
      <LanguageProvider initialLang="fil">
        <ResidentReportsList
          reports={[{ id: "r1", zoneName: "Barangay Nilombot", depthLevel: "waist", reportedAt: "2026-09-01T00:00:00Z" }]}
        />
      </LanguageProvider>
    );

    expect(screen.getByText("Hanggang baywang")).toBeInTheDocument();
  });

  it("falls back to the raw value for a depth level it doesn't recognize, instead of crashing", () => {
    render(
      <ResidentReportsList
        reports={[{ id: "r1", zoneName: "Barangay Nilombot", depthLevel: "shoulder", reportedAt: "2026-09-01T00:00:00Z" }]}
      />
    );

    expect(screen.getByText("shoulder")).toBeInTheDocument();
  });
});
