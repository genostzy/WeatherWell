"use client";

import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { PersonalStatusHeadline } from "@/features/homepage-map/personal-status-headline";
import { HomepageMap } from "@/features/homepage-map/homepage-map";
import { ZoneAlertListFallback } from "@/features/homepage-map/zone-alert-list-fallback";
import { useIsOnline } from "@/features/homepage-map/use-tiles-cached";
import { useSelectedZone } from "@/features/zones/use-selected-zone";
import { useZones } from "@/lib/reference-data/use-reference-data";
import { orderZonesWithSelectedFirst } from "@/lib/order-zones";
import { useHasOnboarded } from "@/features/onboarding/onboarding-storage";

/** Everything that actually needs zone data — split out so Home itself never calls useZones() before onboarding status is known. */
function HomeContent() {
  const isOnline = useIsOnline();
  const zones = useZones();
  const selectedZone = useSelectedZone();
  const orderedZones = orderZonesWithSelectedFirst(zones, selectedZone.id);

  return isOnline ? (
    <HomepageMap zones={orderedZones} />
  ) : (
    <>
      <PersonalStatusHeadline zone={selectedZone} />
      <ZoneAlertListFallback zones={orderedZones} />
    </>
  );
}

/**
 * ReferenceDataProvider bypasses its own loading gate on `/` for a
 * not-yet-onboarded visitor (see that provider's doc comment), so
 * OnboardingGate below can redirect without first waiting on the full
 * nationwide fetch. But a bypass only helps if nothing here still forces
 * that wait — the original bug: this component used to call useZones()
 * unconditionally, before OnboardingGate's own redirect effect ever got a
 * chance to run, so it threw immediately regardless of the provider's
 * bypass. HomeContent (and its useZones()) now mounts only once `onboarded`
 * is confirmed `true` — never while it's `false` (about to redirect) or
 * `null` (not yet known).
 */
export default function Home() {
  const onboarded = useHasOnboarded();

  return (
    <main className="flex flex-1 flex-col items-center gap-3 p-4 sm:gap-4 sm:p-6 lg:p-8">
      <OnboardingGate />
      {onboarded === true && <HomeContent />}
    </main>
  );
}
