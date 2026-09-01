import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentNotice } from "./consent-notice";
import { LanguageProvider } from "@/features/i18n/language-provider";

describe("ConsentNotice", () => {
  it("names both kinds of personal data it collects", () => {
    render(<ConsentNotice onAccept={() => {}} />);
    expect(screen.getByText(/location/i)).toBeInTheDocument();
    expect(screen.getByText(/phone number/i)).toBeInTheDocument();
  });

  it("cites the Data Privacy Act so the legal basis is visible", () => {
    render(<ConsentNotice onAccept={() => {}} />);
    expect(screen.getByText(/RA 10173/i)).toBeInTheDocument();
  });

  it("calls onAccept when the accept button is clicked", async () => {
    const onAccept = vi.fn();
    render(<ConsentNotice onAccept={onAccept} />);
    await userEvent.click(screen.getByRole("button", { name: /i understand/i }));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it("renders the whole notice in Filipino when that language is active", () => {
    render(
      <LanguageProvider initialLang="fil">
        <ConsentNotice onAccept={() => {}} />
      </LanguageProvider>
    );
    expect(screen.getByText(/Hinihingi ng WeatherWell ang iyong lokasyon/)).toBeInTheDocument();
    expect(screen.getByText(/numero ng telepono/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /naiintindihan ko/i })).toBeInTheDocument();
    expect(screen.queryByText(/WeatherWell asks for your location/)).not.toBeInTheDocument();
  });

  it("keeps the RA 10173 citation in Filipino too", () => {
    render(
      <LanguageProvider initialLang="fil">
        <ConsentNotice onAccept={() => {}} />
      </LanguageProvider>
    );
    expect(screen.getByText(/RA 10173/i)).toBeInTheDocument();
    expect(screen.getByText(/pahintulot/i)).toBeInTheDocument();
  });
});
