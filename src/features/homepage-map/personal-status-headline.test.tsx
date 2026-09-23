import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { PersonalStatusHeadline } from "./personal-status-headline";
import { renderWithData, FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import { getActiveAlertForZone, MOCK_ALERTS } from "@/lib/mock-data";

vi.mock("@/lib/use-weather-data", () => ({
  useWeatherData: () => ({
    current: { rainfall_mm: 16, wind_kph: 5, temperature_c: 27, apparent_temperature_c: 31, humidity_pct: 90, weather_code: 61, fetched_at: "x" },
    rainfallHistory: [],
    rainfallForecast: [],
    isLoading: false,
    error: null,
  }),
}));
import { zoneWithSeverity } from "@/test-utils/mock-fixtures";
import { t } from "@/lib/i18n";
import type { AlertRecord, LanguageCode, Zone } from "@/lib/types";

/** Every mock zone carries an active alert, so a Safe zone has to be synthesised — this id matches none of them. */
const SAFE_ZONE: Zone = { ...FIXTURE_REFERENCE_DATA.zones[0], id: "zone-with-no-alert" };

/** MOCK_ALERTS with one zone's alert replaced — the operator-action equivalent of the old setZoneAlertOverride. */
function withZoneAlert(zoneId: string, changes: Partial<AlertRecord>): AlertRecord[] {
  return MOCK_ALERTS.map((a) => (a.zoneId === zoneId ? { ...a, ...changes } : a));
}

/**
 * PersonalStatusHeadline takes its zone as a prop rather than from
 * ReferenceDataContext, so renderWithData's extra context (reference data,
 * tooltip provider) is unused but harmless here — it's still the shared path
 * for supplying AlertsContext via the `alerts` option.
 */
function renderHeadline(zone: Zone, lang?: LanguageCode, alerts: AlertRecord[] = MOCK_ALERTS) {
  return renderWithData(<PersonalStatusHeadline zone={zone} />, { lang, alerts });
}

describe("PersonalStatusHeadline", () => {
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
    // From the live reading (16 mm/hr), not a per-zone mock.
    expect(screen.getByText(/heavy rain right now/i)).toBeInTheDocument();
  });

  it("follows a non-Safe headline with the zone's actual active alert message, not a weather read", () => {
    const alertingZone = zoneWithSeverity("red");
    renderHeadline(alertingZone);
    const alertMessage = t(getActiveAlertForZone(alertingZone.id)!.message, "en");
    expect(screen.getByText(alertMessage)).toBeInTheDocument();
  });

  it("does not let a cleared evacuation order disappear without saying so", () => {
    // The defect this guards: an operator clears the alert, the headline
    // flips to "Safe" with a weather blurb, and a resident who was told to
    // evacuate sees no trace that anything was ever wrong — the same screen
    // they would see if the order had been a bug (PRD layer 9).
    const zone = zoneWithSeverity("evacuate");
    renderHeadline(zone, undefined, withZoneAlert(zone.id, { isActive: false }));

    expect(screen.getByRole("heading", { name: "Safe" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Alert lifted/i);
    expect(screen.getByRole("status")).toHaveTextContent(/Evacuate Now/i);
  });

  it("says so when an order is lowered rather than lifted", () => {
    const zone = zoneWithSeverity("evacuate");
    renderHeadline(zone, undefined, withZoneAlert(zone.id, { severity: "yellow", supersededSeverity: "evacuate" }));

    expect(screen.getByRole("status")).toHaveTextContent(/downgraded/i);
  });

  it("stays quiet when an operator escalates, which announces itself", () => {
    const zone = zoneWithSeverity("yellow");
    renderHeadline(zone, undefined, withZoneAlert(zone.id, { severity: "evacuate", supersededSeverity: "yellow" }));

    expect(screen.getByRole("heading", { name: "Hazardous" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the Filipino headline when that language is active", () => {
    renderHeadline(SAFE_ZONE, "fil");
    expect(screen.getByRole("heading", { name: "Ligtas" })).toBeInTheDocument();
  });

  it("shows a new server alert even on a device that once stored a cleared override", () => {
    // The finding this task closes. A device that recorded {"zone-1":
    // {"alertSeverity":"none"}} last week used to suppress every later alert
    // for that zone, including a new evacuate order. Nothing reads that key
    // any more, and this test is what keeps it that way.
    const zone = zoneWithSeverity("evacuate");
    localStorage.setItem("weatherwell.zoneOverrides", JSON.stringify({ [zone.id]: { alertSeverity: "none" } }));

    renderHeadline(zone);

    expect(screen.getByRole("heading", { name: "Hazardous" })).toBeInTheDocument();
    expect(screen.getByText(/evacuate/i)).toBeInTheDocument();
  });
});
