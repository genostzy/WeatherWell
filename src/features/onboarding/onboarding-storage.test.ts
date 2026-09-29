import { describe, it, expect, beforeEach, vi } from "vitest";
import { CONSENT_ITEMS } from "./consent-notice";
import { CONSENT_VERSION, hasConsented, hasOnboarded, markConsented, markOnboarded, setSelectedZoneId } from "./onboarding-storage";

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

  it("asks again of a resident who accepted the notice before it named the walking route planner", () => {
    window.localStorage.setItem("weatherwell.consent", "2026-09-25");
    expect(hasConsented()).toBe(false);

    window.localStorage.setItem("weatherwell.consent", "2026-09-28");
    expect(hasConsented()).toBe(true);
  });

  it("gets a new version whenever what the notice says changes", () => {
    // Changed the notice? Bump CONSENT_VERSION, so everyone who accepted the
    // old one sees the new one, then record the new fingerprint here.
    expect({ version: CONSENT_VERSION, text: fingerprint(JSON.stringify(CONSENT_ITEMS)) }).toEqual({
      version: "2026-09-28",
      text: "a2225691",
    });
  });
});

describe("my barangay on this phone", () => {
  it("setSelectedZoneId says whether the phone kept it", () => {
    expect(setSelectedZoneId("zone-2")).toBe(true);
    const blocked = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(setSelectedZoneId("zone-3")).toBe(false);
    } finally {
      blocked.mockRestore();
    }
  });
});
