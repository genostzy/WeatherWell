import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CONSENT_ITEMS, ConsentNotice } from "./consent-notice";
import { LanguageProvider } from "@/features/i18n/language-provider";

describe("ConsentNotice", () => {
  it("names the data it really collects, and promises no SMS it does not send (found reviewing the app)", () => {
    render(<ConsentNotice onAccept={() => {}} />);
    expect(screen.getByText(/uses your location to suggest your barangay/i)).toBeInTheDocument();
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
    expect(screen.getByText(/Ginagamit ng WeatherWell ang iyong lokasyon/)).toBeInTheDocument();
    expect(screen.getByText(/Kung i-on mo ang mga alerto/)).toBeInTheDocument();
    expect(screen.queryByText(/SMS alert/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /naiintindihan ko/i })).toBeInTheDocument();
    expect(screen.queryByText(/WeatherWell uses your location/)).not.toBeInTheDocument();
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

  describe.each(["en", "fil"] as const)("in %s", (lang) => {
    const other = lang === "en" ? "fil" : "en";

    function renderGroups() {
      render(
        <LanguageProvider initialLang={lang}>
          <ConsentNotice onAccept={() => {}} />
        </LanguageProvider>
      );
      return {
        choices: screen.getByRole("list", { name: lang === "en" ? "You choose" : "Ikaw ang pipili" }),
        alwaysOn: screen.getByRole("list", { name: lang === "en" ? "Always on" : "Laging naka-on" }),
      };
    }

    it("gives every choice its cost of saying no, and shows no untranslated item (found in review)", () => {
      const { choices, alwaysOn } = renderGroups();
      for (const item of CONSENT_ITEMS) {
        const group = item.ifYouSayNo ? choices : alwaysOn;
        expect(within(group).getByText(item.text[lang])).toBeInTheDocument();
        if (item.ifYouSayNo) {
          expect(within(group).getByText(item.ifYouSayNo[lang])).toBeInTheDocument();
        }
        expect(screen.queryByText(item.text[other])).not.toBeInTheDocument();
      }
    });

    it("lists crash reports under Always on, since nothing turns them off (found in review)", () => {
      const { choices, alwaysOn } = renderGroups();
      const errors = CONSENT_ITEMS.find((item) => item.id === "errors")!;
      expect(within(alwaysOn).getByText(errors.text[lang])).toBeInTheDocument();
      expect(within(choices).queryByText(errors.text[lang])).not.toBeInTheDocument();
    });
  });
});
