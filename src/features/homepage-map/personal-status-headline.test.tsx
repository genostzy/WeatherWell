import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonalStatusHeadline } from "./personal-status-headline";
import { setZoneAlertOverride } from "@/lib/zone-overrides";
import { AlertsContext } from "@/lib/alerts-store";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { getActiveAlertForZone, getFriendlyWeatherRead, MOCK_ALERTS } from "@/lib/mock-data";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { zoneWithSeverity } from "@/test-utils/mock-fixtures";
import { t } from "@/lib/i18n";
import type { LanguageCode, Zone } from "@/lib/types";

/** Every mock zone carries an active alert, so a Safe zone has to be synthesised — this id matches none of them. */
const SAFE_ZONE: Zone = { ...FIXTURE_REFERENCE_DATA.zones[0], id: "zone-with-no-alert" };

/**
 * PersonalStatusHeadline takes its zone as a prop rather than from
 * ReferenceDataContext, so it only needs a LanguageProvider (which defaults
 * to English without one) and an AlertsContext ancestor for
 * useActiveAlertForZone — MOCK_ALERTS mirrors the same fixtures
 * zoneWithSeverity/getActiveAlertForZone read below.
 */
function renderHeadline(zone: Zone, lang?: LanguageCode) {
  return render(
    <LanguageProvider initialLang={lang}>
      <AlertsContext.Provider value={MOCK_ALERTS}>
        <PersonalStatusHeadline zone={zone} />
      </AlertsContext.Provider>
    </LanguageProvider>
  );
}

describe("PersonalStatusHeadline", () => {
  // Overrides persist to localStorage, so one test's downgrade would otherwise
  // leak into the next test's idea of that zone's severity.
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows 'Safe' for a zone with no active alert", () => {
    renderHeadline(SAFE_ZONE);
    expect(screen.getByRole("heading", { name: "Safe" })).toBeInTheDocument();
  });

  it("shows 'Cautionary' for a yellow alert", () => {
    renderHeadline(zoneWithSeverity("yellow"));
    expect(screen.getByRole("heading", { name: "Cautionary" })).toBeInTheDocument();
  });

  it("shows 'Dangerous' for a red alert", () => {
    renderHeadline(zoneWithSeverity("red"));
    expect(screen.getByRole("heading", { name: "Dangerous" })).toBeInTheDocument();
  });

  it("shows 'Hazardous' for an evacuate alert", () => {
    renderHeadline(zoneWithSeverity("evacuate"));
    expect(screen.getByRole("heading", { name: "Hazardous" })).toBeInTheDocument();
  });

  it("shows the zone name under the headline", () => {
    renderHeadline(FIXTURE_REFERENCE_DATA.zones[0]);
    expect(screen.getByText(FIXTURE_REFERENCE_DATA.zones[0].name)).toBeInTheDocument();
  });

  it("follows a Safe headline with a friendly weather read", () => {
    renderHeadline(SAFE_ZONE);
    const weatherRead = t(getFriendlyWeatherRead(SAFE_ZONE.id), "en");
    expect(screen.getByText(weatherRead)).toBeInTheDocument();
  });

  it("follows a non-Safe headline with the zone's actual active alert message, not a weather read", () => {
    const alertingZone = zoneWithSeverity("red");
    renderHeadline(alertingZone);
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
    renderHeadline(zone);

    expect(screen.getByRole("heading", { name: "Safe" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Alert lifted/i);
    expect(screen.getByRole("status")).toHaveTextContent(/Evacuate Now/i);
  });

  it("says so when an order is lowered rather than lifted", () => {
    const zone = zoneWithSeverity("evacuate");
    setZoneAlertOverride(zone.id, "yellow");
    renderHeadline(zone);

    expect(screen.getByRole("status")).toHaveTextContent(/downgraded/i);
  });

  it("stays quiet when an operator escalates, which announces itself", () => {
    const zone = zoneWithSeverity("yellow");
    setZoneAlertOverride(zone.id, "evacuate");
    renderHeadline(zone);

    expect(screen.getByRole("heading", { name: "Hazardous" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the Filipino headline when that language is active", () => {
    renderHeadline(SAFE_ZONE, "fil");
    expect(screen.getByRole("heading", { name: "Ligtas" })).toBeInTheDocument();
  });
});
