import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { ResidentPinsList } from "./resident-pins-list";

describe("ResidentPinsList", () => {
  it("shows the status, zone and a Removed tag in English by default", () => {
    render(
      <ResidentPinsList
        pins={[
          {
            id: "p1",
            zoneName: "Barangay Nilombot",
            statusTag: "flooded",
            caption: "Waist deep",
            createdAt: "2026-09-01T00:00:00Z",
            removed: true,
          },
        ]}
      />
    );

    expect(screen.getByText("Barangay Nilombot")).toBeInTheDocument();
    expect(screen.getByText("Waist deep")).toBeInTheDocument();
    expect(screen.getByText(/Flooded/)).toBeInTheDocument();
    expect(screen.getByText(/\(Removed\)/)).toBeInTheDocument();
  });

  it("renders fully in Filipino, including the empty state and the Removed tag", () => {
    render(
      <LanguageProvider initialLang="fil">
        <ResidentPinsList
          pins={[
            {
              id: "p1",
              zoneName: "Barangay Nilombot",
              statusTag: "impassable",
              caption: null,
              createdAt: "2026-09-01T00:00:00Z",
              removed: true,
            },
          ]}
        />
      </LanguageProvider>
    );

    expect(screen.getByText(/Hindi Madaanan/)).toBeInTheDocument();
    expect(screen.getByText(/\(Naalis\)/)).toBeInTheDocument();
  });

  it("shows the Filipino empty state with no pins", () => {
    render(
      <LanguageProvider initialLang="fil">
        <ResidentPinsList pins={[]} />
      </LanguageProvider>
    );

    expect(screen.getByText("Aking mga Pin")).toBeInTheDocument();
    expect(screen.getByText(/Wala pang pin/)).toBeInTheDocument();
  });
});
