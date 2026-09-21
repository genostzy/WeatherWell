import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { ResidentCheckInsList } from "./resident-check-ins-list";

describe("ResidentCheckInsList", () => {
  it("shows a compact Safe / Needs help status in English by default", () => {
    render(
      <ResidentCheckInsList
        checkIns={[
          { id: "c1", zoneName: "Barangay Nilombot", status: "safe", checkedInAt: "2026-09-01T00:00:00Z" },
          { id: "c2", zoneName: "Barangay Nilombot", status: "needs_help", checkedInAt: "2026-09-01T00:00:00Z" },
        ]}
      />
    );

    expect(screen.getByText("Safe")).toBeInTheDocument();
    expect(screen.getByText("Needs help")).toBeInTheDocument();
  });

  it("renders fully in Filipino, including the empty state", () => {
    render(
      <LanguageProvider initialLang="fil">
        <ResidentCheckInsList checkIns={[]} />
      </LanguageProvider>
    );

    expect(screen.getByText("Aking mga Check-in")).toBeInTheDocument();
    expect(screen.getByText(/Wala pang check-in/)).toBeInTheDocument();
  });

  it("translates the status in Filipino too", () => {
    render(
      <LanguageProvider initialLang="fil">
        <ResidentCheckInsList
          checkIns={[{ id: "c1", zoneName: "Barangay Nilombot", status: "needs_help", checkedInAt: "2026-09-01T00:00:00Z" }]}
        />
      </LanguageProvider>
    );

    expect(screen.getByText("Kailangan ng tulong")).toBeInTheDocument();
  });
});
