import { describe, it, expect, beforeEach } from "vitest";
import { clearRetiredStorage } from "./retired-storage";

const RETIRED_KEYS = [
  "weatherwell.zoneOverrides",
  "weatherwell.communityPins",
  "weatherwell.communityPinVotes",
  "weatherwell.evacuationCheckIns",
  "weatherwell.waterLevelReports",
  "weatherwell.deviceId",
];

/** Deliberately local (onboarded, selectedZoneId) or still holding undelivered writes (outbox) — clearRetiredStorage must never touch these. */
const SURVIVING_KEYS = ["weatherwell.onboarded", "weatherwell.selectedZoneId", "weatherwell.outbox"];

describe("clearRetiredStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("removes every retired key", () => {
    for (const key of RETIRED_KEYS) localStorage.setItem(key, "1");

    clearRetiredStorage();

    for (const key of RETIRED_KEYS) expect(localStorage.getItem(key)).toBeNull();
  });

  it("leaves onboarded, selectedZoneId and the outbox untouched", () => {
    // onboarded/selectedZoneId are deliberately local, and the outbox holds
    // writes that have not reached the server yet — sweeping any of them
    // would either re-show onboarding to a returning resident, forget their
    // chosen zone, or silently drop a queued report.
    for (const key of SURVIVING_KEYS) localStorage.setItem(key, "kept");

    clearRetiredStorage();

    for (const key of SURVIVING_KEYS) expect(localStorage.getItem(key)).toBe("kept");
  });
});
