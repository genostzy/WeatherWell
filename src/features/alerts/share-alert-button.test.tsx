import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShareAlertButton } from "./share-alert-button";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { MOCK_ZONES, getActiveAlertForZone } from "@/lib/mock-data";
import type { LanguageCode } from "@/lib/types";

/**
 * Share Alert is the outage-time distribution path: the text it produces
 * leaves the app and lands in a neighbour's messaging app, often someone who
 * has never seen WeatherWell and has nothing to interpret it with. So what
 * matters here is the wording that escapes, not the button's markup.
 */
const zone = MOCK_ZONES.find((z) => z.id === "zone-2")!;
const alert = getActiveAlertForZone(zone.id)!;

function shareTextFrom(lang: LanguageCode): string {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", { value: share, configurable: true });

  render(
    <LanguageProvider initialLang={lang}>
      <ShareAlertButton alert={alert} zone={zone} />
    </LanguageProvider>
  );
  fireEvent.click(screen.getByRole("button"));

  return share.mock.calls[0][0].text as string;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
});

describe("ShareAlertButton", () => {
  it("shares the severity as the label a person reads, not the internal enum", () => {
    const text = shareTextFrom("en");
    expect(text).toContain("Evacuate Now");
    // "EVACUATE" is the stored value, meaningless to a recipient and easily
    // mistaken for a PAGASA colour level, which it is not.
    expect(text).not.toContain("EVACUATE —");
  });

  it("localises the severity along with the rest of the message", () => {
    const text = shareTextFrom("fil");
    expect(text).toContain("Lumikas Na");
    expect(text).not.toContain("Evacuate Now");
  });

  it("carries the zone and its evacuation centre so the text stands alone", () => {
    const text = shareTextFrom("en");
    expect(text).toContain(zone.name);
    expect(text).toContain(zone.evacuationCenterName);
  });
});
