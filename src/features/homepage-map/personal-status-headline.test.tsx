import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonalStatusHeadline } from "./personal-status-headline";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { MOCK_ZONES } from "@/lib/mock-data";
import type { Zone } from "@/lib/types";

/** zone-1/2/3 all carry an active mock alert; this id matches none of them. */
const SAFE_ZONE: Zone = { ...MOCK_ZONES[0], id: "zone-with-no-alert" };

describe("PersonalStatusHeadline", () => {
  it("shows 'You are safe' for a zone with no active alert", () => {
    render(<PersonalStatusHeadline zone={SAFE_ZONE} />);
    expect(screen.getByRole("heading", { name: "You are safe" })).toBeInTheDocument();
  });

  it("shows a cautionary headline for an orange alert (zone-1)", () => {
    render(<PersonalStatusHeadline zone={MOCK_ZONES[0]} />);
    expect(
      screen.getByRole("heading", { name: "Stay alert in your area" })
    ).toBeInTheDocument();
  });

  it("shows a dangerous headline for a red alert (zone-2)", () => {
    render(<PersonalStatusHeadline zone={MOCK_ZONES[1]} />);
    expect(screen.getByRole("heading", { name: "Danger in your area" })).toBeInTheDocument();
  });

  it("shows an evacuate headline for an evacuate alert (zone-3)", () => {
    render(<PersonalStatusHeadline zone={MOCK_ZONES[2]} />);
    expect(screen.getByRole("heading", { name: "Evacuate now" })).toBeInTheDocument();
  });

  it("shows the zone name under the headline", () => {
    render(<PersonalStatusHeadline zone={MOCK_ZONES[0]} />);
    expect(screen.getByText(MOCK_ZONES[0].name)).toBeInTheDocument();
  });

  it("shows the Filipino headline when that language is active", () => {
    render(
      <LanguageProvider initialLang="fil">
        <PersonalStatusHeadline zone={SAFE_ZONE} />
      </LanguageProvider>
    );
    expect(screen.getByRole("heading", { name: "Ligtas ka" })).toBeInTheDocument();
  });
});
