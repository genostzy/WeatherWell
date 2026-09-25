import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentNotice } from "./consent-notice";
import { LanguageProvider } from "@/features/i18n/language-provider";

describe("ConsentNotice", () => {
  it("names the data it really collects, and promises no SMS it does not send (found reviewing the app)", () => {
    render(<ConsentNotice onAccept={() => {}} />);
    expect(screen.getByText(/asks for your location/i)).toBeInTheDocument();
    expect(screen.getByText(/if you turn on alerts/i)).toBeInTheDocument();
    expect(screen.getByText(/neighbours.*stay on this phone/i)).toBeInTheDocument();
    expect(screen.queryByText(/sms alert/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/your phone number/i)).not.toBeInTheDocument();
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
    expect(screen.getByText(/Kung i-on mo ang mga alerto/)).toBeInTheDocument();
    expect(screen.queryByText(/SMS alert/)).not.toBeInTheDocument();
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

  it("discloses anonymous crash reporting in English", () => {
    render(<ConsentNotice onAccept={() => {}} />);
    expect(
      screen.getByText(/an anonymous error report — with no name, location or account — is sent/)
    ).toBeInTheDocument();
  });

  it("discloses anonymous crash reporting in Filipino", () => {
    render(
      <LanguageProvider initialLang="fil">
        <ConsentNotice onAccept={() => {}} />
      </LanguageProvider>
    );
    expect(
      screen.getByText(/isang hindi nagpapakilalang ulat ng error — walang pangalan, lokasyon, o account/)
    ).toBeInTheDocument();
  });
});
