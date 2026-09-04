import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonalStatusHeadline } from "./personal-status-headline";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { MOCK_ZONES, getActiveAlertForZone, getFriendlyWeatherRead } from "@/lib/mock-data";
import { zoneWithSeverity } from "@/test-utils/mock-fixtures";
import { t } from "@/lib/i18n";
import type { Zone } from "@/lib/types";

/** Every mock zone carries an active alert, so a Safe zone has to be synthesised — this id matches none of them. */
const SAFE_ZONE: Zone = { ...MOCK_ZONES[0], id: "zone-with-no-alert" };

describe("PersonalStatusHeadline", () => {
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

  it("shows the Filipino headline when that language is active", () => {
    render(
      <LanguageProvider initialLang="fil">
        <PersonalStatusHeadline zone={SAFE_ZONE} />
      </LanguageProvider>
    );
    expect(screen.getByRole("heading", { name: "Ligtas" })).toBeInTheDocument();
  });
});
