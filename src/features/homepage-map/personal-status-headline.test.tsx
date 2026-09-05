import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonalStatusHeadline } from "./personal-status-headline";
import { setZoneAlertOverride } from "@/lib/zone-overrides";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { MOCK_ZONES, getActiveAlertForZone, getFriendlyWeatherRead } from "@/lib/mock-data";
import { zoneWithSeverity } from "@/test-utils/mock-fixtures";
import { t } from "@/lib/i18n";
import type { Zone } from "@/lib/types";

/** Every mock zone carries an active alert, so a Safe zone has to be synthesised — this id matches none of them. */
const SAFE_ZONE: Zone = { ...MOCK_ZONES[0], id: "zone-with-no-alert" };

describe("PersonalStatusHeadline", () => {
  // Overrides persist to localStorage, so one test's downgrade would otherwise
  // leak into the next test's idea of that zone's severity.
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows 'Safe' for a zone with no active alert", () => {
    render(<PersonalStatusHeadline zone={SAFE_ZONE} />);
    expect(screen.getByRole("heading", { name: "Safe" })).toBeInTheDocument();
  });

  it("shows 'Cautionary' for a yellow alert", () => {
    render(<PersonalStatusHeadline zone={zoneWithSeverity("yellow")} />);
    expect(screen.getByRole("heading", { name: "Cautionary" })).toBeInTheDocument();
  });

  it("shows 'Dangerous' for a red alert", () => {
    render(<PersonalStatusHeadline zone={zoneWithSeverity("red")} />);
    expect(screen.getByRole("heading", { name: "Dangerous" })).toBeInTheDocument();
  });

  it("shows 'Hazardous' for an evacuate alert", () => {
    render(<PersonalStatusHeadline zone={zoneWithSeverity("evacuate")} />);
    expect(screen.getByRole("heading", { name: "Hazardous" })).toBeInTheDocument();
  });

  it("shows the zone name under the headline", () => {
    render(<PersonalStatusHeadline zone={MOCK_ZONES[0]} />);
    expect(screen.getByText(MOCK_ZONES[0].name)).toBeInTheDocument();
  });

  it("follows a Safe headline with a friendly weather read", () => {
    render(<PersonalStatusHeadline zone={SAFE_ZONE} />);
    const weatherRead = t(getFriendlyWeatherRead(SAFE_ZONE.id), "en");
    expect(screen.getByText(weatherRead)).toBeInTheDocument();
  });

  it("follows a non-Safe headline with the zone's actual active alert message, not a weather read", () => {
    const alertingZone = zoneWithSeverity("red");
    render(<PersonalStatusHeadline zone={alertingZone} />);
    const alertMessage = t(getActiveAlertForZone(alertingZone.id)!.message, "en");
    expect(screen.getByText(alertMessage)).toBeInTheDocument();
  });

  it("does not let a cleared evacuation order disappear without saying so", () => {
    // The defect this guards: clearing an override drops the alert, the
    // headline flips to "Safe" with a weather blurb, and a resident who was
    // told to evacuate sees no trace that anything was ever wrong — the same
    // screen they would see if the order had been a bug (PRD layer 9).
    const zone = zoneWithSeverity("evacuate");
    setZoneAlertOverride(zone.id, "none");
    render(<PersonalStatusHeadline zone={zone} />);

    expect(screen.getByRole("heading", { name: "Safe" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Alert lifted/i);
    expect(screen.getByRole("status")).toHaveTextContent(/Evacuate Now/i);
  });

  it("says so when an order is lowered rather than lifted", () => {
    const zone = zoneWithSeverity("evacuate");
    setZoneAlertOverride(zone.id, "yellow");
    render(<PersonalStatusHeadline zone={zone} />);

    expect(screen.getByRole("status")).toHaveTextContent(/downgraded/i);
  });

  it("stays quiet when an operator escalates, which announces itself", () => {
    const zone = zoneWithSeverity("yellow");
    setZoneAlertOverride(zone.id, "evacuate");
    render(<PersonalStatusHeadline zone={zone} />);

    expect(screen.getByRole("heading", { name: "Hazardous" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the Filipino headline when that language is active", () => {
    render(
      <LanguageProvider initialLang="fil">
        <PersonalStatusHeadline zone={SAFE_ZONE} />
      </LanguageProvider>
    );
    expect(screen.getByRole("heading", { name: "Ligtas" })).toBeInTheDocument();
  });
});
