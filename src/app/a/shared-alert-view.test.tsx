import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SharedAlertView } from "./shared-alert-view";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { encodeAlert, type SharedAlert } from "@/lib/alert-share/payload";

const ALERT: SharedAlert = {
  v: 1,
  zoneId: "zone-unknown-to-this-device",
  zoneName: "Barangay Malimpuec, Mapandan",
  severity: "evacuate",
  issuedAt: "2026-09-22T14:32:00.000Z",
  message: "Waist-deep flooding. Leave now.",
  centerName: "Malimpuec Covered Court",
  hotline: "09171234567",
};

function renderWithHash(hash: string) {
  window.location.hash = hash;
  return render(
    <LanguageProvider>
      <SharedAlertView />
    </LanguageProvider>
  );
}

beforeEach(() => {
  window.location.hash = "";
});

describe("SharedAlertView", () => {
  it("renders an alert for a zone this device has never seen", () => {
    // Review Focus 3: the recipient may be in a different municipality with
    // no local data for this zone. Everything shown comes from the payload,
    // so there is nothing to look up and nothing to fail.
    renderWithHash(`#${encodeAlert(ALERT)}`);

    expect(screen.getByText(/Barangay Malimpuec, Mapandan/)).toBeInTheDocument();
    expect(screen.getByText(/Waist-deep flooding/)).toBeInTheDocument();
    expect(screen.getByText(/Malimpuec Covered Court/)).toBeInTheDocument();
  });

  it("offers the hotline as a tel: link", () => {
    renderWithHash(`#${encodeAlert(ALERT)}`);
    expect(screen.getByRole("link", { name: /09171234567/ })).toHaveAttribute(
      "href",
      "tel:09171234567"
    );
  });

  it("says the link is damaged rather than rendering a half-alert", () => {
    const encoded = encodeAlert(ALERT);
    renderWithHash(`#${encoded.slice(0, encoded.length - 12)}`);

    expect(screen.getByRole("alert").textContent).toMatch(/damaged|incomplete/i);
    expect(screen.queryByText(/Malimpuec Covered Court/)).not.toBeInTheDocument();
  });

  it("says the link is damaged when there is no fragment at all", () => {
    renderWithHash("");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("marks a shared alert as unverified", () => {
    // Nothing yet proves a forwarded alert came from an official. Until
    // signing ships, say so plainly rather than let a forwarded message
    // borrow the authority of the app's own alerts.
    renderWithHash(`#${encodeAlert(ALERT)}`);
    expect(screen.getByText(/forwarded|unverified/i)).toBeInTheDocument();
  });

  it("gives the unverified notice real visual weight, not the least prominent line on the card", () => {
    // The recipient's only signal that a phone number on this screen is
    // unvetted is this notice — it must not be smaller/quieter than the
    // content it's warning about.
    renderWithHash(`#${encodeAlert(ALERT)}`);
    const notice = screen.getByText(/forwarded|unverified/i).closest("[data-slot='notice']");
    expect(notice).not.toBeNull();
  });

  it("colors the severity by its key when the payload carries one, same palette as the app's own alerts", () => {
    renderWithHash(`#${encodeAlert({ ...ALERT, severityKey: "evacuate" })}`);
    const badge = screen.getByText(ALERT.severity);
    expect(badge.className).toMatch(/severity-evacuate/);
  });

  it("does not claim a color for a severity it cannot map to a known key", () => {
    renderWithHash(`#${encodeAlert(ALERT)}`); // no severityKey
    const text = screen.getByText(ALERT.severity);
    expect(text.className).not.toMatch(/severity-/);
  });

  it("cautions that the hotline number came from whoever sent the link, not from WeatherWell", () => {
    renderWithHash(`#${encodeAlert(ALERT)}`);
    expect(screen.getByText(/number came from|hindi verified na numero|sender/i)).toBeInTheDocument();
  });

  it("never shows the literal string 'Invalid Date' for a structurally-valid but corrupted timestamp", () => {
    // isSharedAlert only checks typeof issuedAt === "string" — it cannot
    // validate that the string parses, so a corrupted payload can still
    // decode successfully with a garbage issuedAt.
    renderWithHash(`#${encodeAlert({ ...ALERT, issuedAt: "not-a-real-timestamp" })}`);
    expect(screen.queryByText(/invalid date/i)).not.toBeInTheDocument();
  });
});
