import { describe, it, expect, beforeEach } from "vitest";
import { CONSENT_ITEMS } from "./consent-notice";
import { CONSENT_VERSION, hasConsented, hasOnboarded, markConsented, markOnboarded } from "./onboarding-storage";

/** FNV-1a, 32-bit: a stable fingerprint of the notice's text. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

describe("consent is versioned (privacy review)", () => {
  beforeEach(() => window.localStorage.clear());

  it("counts a resident as onboarded only once they accepted the current notice", () => {
    markOnboarded();
    expect(hasOnboarded()).toBe(false); // set up before the notice was versioned

    window.localStorage.setItem("weatherwell.consent", "2000-01-01");
    expect(hasConsented()).toBe(false); // an older notice
    expect(hasOnboarded()).toBe(false);

    markConsented();
    expect(hasConsented()).toBe(true);
    expect(hasOnboarded()).toBe(true);
  });

  it("gets a new version whenever what the notice says changes", () => {
    // Changed the notice? Bump CONSENT_VERSION, so everyone who accepted the
    // old one sees the new one, then record the new fingerprint here.
    expect({ version: CONSENT_VERSION, text: fingerprint(JSON.stringify(CONSENT_ITEMS)) }).toEqual({
      version: "2026-09-25",
      text: "a8085da0",
    });
  });
});
