"use client";

/**
 * Keys this app used to write and no longer reads.
 *
 * Leaving them is not harmless. `weatherwell.zoneOverrides` in particular
 * held an operator decision that used to outrank the server's alert for that
 * device — the reason it is gone. The others hold a resident's own pins,
 * votes and check-ins from before any of it was shared.
 *
 * Those local pins are NOT migrated to the server, and that is a decision
 * rather than an omission: they were written with no identity that can be
 * attributed, so uploading them would either invent an author or attach a
 * stranger's content to whoever happens to hold the device now.
 */
const RETIRED_KEYS = [
  "weatherwell.zoneOverrides",
  "weatherwell.communityPins",
  "weatherwell.communityPinVotes",
  "weatherwell.evacuationCheckIns",
  "weatherwell.waterLevelReports",
  "weatherwell.deviceId",
];

export function clearRetiredStorage(): void {
  for (const key of RETIRED_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Blocked or full storage. There is nothing to do and nothing at
      // stake: nothing reads these keys any more.
    }
  }
}
