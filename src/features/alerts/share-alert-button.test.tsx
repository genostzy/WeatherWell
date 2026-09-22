import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShareAlertButton } from "./share-alert-button";
import { LanguageProvider } from "@/features/i18n/language-provider";
import { getActiveAlertForZone } from "@/lib/mock-data";
import { FIXTURE_REFERENCE_DATA } from "@/test-utils/render-with-data";
import type { LanguageCode } from "@/lib/types";

/**
 * Share Alert is the outage-time distribution path: the text it produces
 * leaves the app and lands in a neighbour's messaging app, often someone who
 * has never seen WeatherWell and has nothing to interpret it with. So what
 * matters here is the wording that escapes, not the button's markup.
 */
const zone = FIXTURE_REFERENCE_DATA.zones.find((z) => z.id === "zone-2")!;
const alert = getActiveAlertForZone(zone.id)!;

function shareTextFrom(lang: LanguageCode): string {
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", { value: share, configurable: true });

  render(
    <LanguageProvider initialLang={lang}>
      <ShareAlertButton alert={alert} zone={zone} />
    </LanguageProvider>
  );
  // First button is always the Share button (before Download Image)
  const buttons = screen.getAllByRole("button");
  fireEvent.click(buttons[0]);

  return share.mock.calls[0][0].text as string;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
});

describe("ShareAlertButton", () => {
  it("shares the severity as the label a person reads, not the internal enum", () => {
    // buildShareText's header line uppercases whatever it's given (plain-
    // text emphasis, no CSS available in an SMS) — case-insensitive match
    // so this pins "the full two-word human label made it through", not one
    // specific casing. The message body legitimately contains its own
    // "Evacuate immediately" prose, so this only checks for the label, not
    // the absence of the word "evacuate" elsewhere.
    const text = shareTextFrom("en");
    expect(text.toLowerCase()).toContain("evacuate now");
  });

  it("localises the severity along with the rest of the message", () => {
    const text = shareTextFrom("fil");
    expect(text.toLowerCase()).toContain("lumikas na");
    expect(text.toLowerCase()).not.toContain("evacuate now");
  });

  it("carries the zone and its evacuation centre so the text stands alone", () => {
    const text = shareTextFrom("en");
    expect(text).toContain(zone.name);
    expect(text).toContain(zone.evacuationCenterName);
  });
});
