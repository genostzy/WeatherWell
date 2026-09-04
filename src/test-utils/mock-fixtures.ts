import { MOCK_ZONES, getActiveAlertForZone } from "@/lib/mock-data";
import { getZoneStatus } from "@/lib/zone-status";
import type { ZoneStatus } from "@/lib/zone-status";
import type { Severity } from "@/lib/severity";
import type { Zone } from "@/lib/types";

/**
 * Fixture selectors that pick a mock zone by what it *is*, not by where it
 * sits in the array.
 *
 * Several tests used to reach for `MOCK_ZONES[1]` as "the red one". That
 * coupling broke the moment the mock alert severities were rebalanced, and it
 * broke badly: the failure surfaced as an opaque "unable to find element"
 * from the DOM, pointing at the assertion rather than at the fixture that had
 * moved out from under it. Selecting by severity keeps these tests working
 * across fixture reshuffles, and when a tier genuinely disappears they fail
 * with the real reason instead.
 *
 * These read the raw mock alert rather than `resolveEffectiveAlert`, so they
 * describe the shipped fixtures rather than whatever a test may have written
 * into the zone-override store.
 */

/** The mock zone whose active alert carries this severity. Throws if the fixtures no longer contain one. */
export function zoneWithSeverity(severity: Severity): Zone {
  const zone = MOCK_ZONES.find((z) => getActiveAlertForZone(z.id)?.severity === severity);
  if (!zone) {
    throw new Error(
      `No mock zone currently has an active "${severity}" alert. The mock alert severities changed — ` +
        `update the fixtures so this tier is represented, or update the test that needs it.`
    );
  }
  return zone;
}

/** Every mock zone whose plain-language status matches — for tests asserting per-status counts. */
export function zonesWithStatus(status: ZoneStatus): Zone[] {
  return MOCK_ZONES.filter((zone) => getZoneStatus(getActiveAlertForZone(zone.id)) === status);
}
