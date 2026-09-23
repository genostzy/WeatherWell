import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AlertCard } from "./alert-card";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { getActiveAlertForZone } from "@/lib/mock-data";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { zoneWithSeverity } from "@/test-utils/mock-fixtures";

// A red zone specifically, so the "Warning" label assertion below stays tied
// to the severity under test rather than to whichever alert happens to be first.
const zone = zoneWithSeverity("red");
const alert = getActiveAlertForZone(zone.id)!;

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

  it("marks an automatic crowd-report alert as unverified", () => {
    render(<AlertCard alert={{ ...alert, source: "auto_crowdsourced" }} zone={zone} />);
    expect(
      screen.getByText("Unverified — based on residents' reports, not yet confirmed by an official.")
    ).toBeInTheDocument();
  });

  it("shows the unverified note in Filipino too", () => {
    render(
      <LanguageProvider initialLang="fil">
        <AlertCard alert={{ ...alert, source: "auto_crowdsourced" }} zone={zone} />
      </LanguageProvider>
    );
    expect(
      screen.getByText("Hindi pa kumpirmado — batay sa ulat ng mga residente, hindi pa napapatunayan ng opisyal.")
    ).toHaveAttribute("lang", "fil");
  });

  it("does not mark an official's alert as unverified", () => {
    render(<AlertCard alert={{ ...alert, source: "manual" }} zone={zone} />);
    expect(screen.queryByText(/not yet confirmed by an official/i)).not.toBeInTheDocument();
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
    render(<AlertCard alert={undefined} zone={FIXTURE_REFERENCE_DATA.zones[2]} />);
    expect(screen.getByText(/no active alert/i)).toBeInTheDocument();
  });
});

describe("AlertCard read-aloud", () => {
  const speak = vi.fn();
  const cancel = vi.fn();

  beforeEach(() => {
    speak.mockClear();
    cancel.mockClear();
    vi.stubGlobal("speechSynthesis", { speak, cancel });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        lang = "";
        constructor(text: string) {
          this.text = text;
        }
      }
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reads the alert aloud in the resident's language", async () => {
    render(
      <LanguageProvider initialLang="fil">
        <AlertCard alert={alert} zone={zone} />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /basahin nang malakas/i }));
    expect(speak).toHaveBeenCalledOnce();
    const utterance = speak.mock.calls[0][0];
    expect(utterance.text).toContain(alert.message.fil);
    expect(utterance.lang).toBe("fil-PH");
  });

  it("offers no button where the browser cannot speak", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("speechSynthesis", undefined);
    render(<AlertCard alert={alert} zone={zone} />);
    expect(screen.queryByRole("button", { name: /read aloud/i })).not.toBeInTheDocument();
  });
});
