"use client";

import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { PersonalStatusHeadline } from "@/features/homepage-map/personal-status-headline";
import { HomepageMap } from "@/features/homepage-map/homepage-map";
import { ZoneAlertListFallback } from "@/features/homepage-map/zone-alert-list-fallback";
import { useIsOnline } from "@/features/homepage-map/use-tiles-cached";
import { useSelectedZone } from "@/features/zones/use-selected-zone";
import { useZones } from "@/lib/reference-data/use-reference-data";
import { orderZonesWithSelectedFirst } from "@/lib/order-zones";

export default function Home() {
  const isOnline = useIsOnline();
  const zones = useZones();
  const selectedZone = useSelectedZone();
  const orderedZones = orderZonesWithSelectedFirst(zones, selectedZone.id);

  return (
    <main className="flex flex-1 flex-col items-center gap-3 p-4 sm:gap-4 sm:p-6 lg:p-8">
      <OnboardingGate />
      {isOnline ? (
        <HomepageMap zones={orderedZones} />
      ) : (
        <>
          <PersonalStatusHeadline zone={selectedZone} />
          <ZoneAlertListFallback zones={orderedZones} />
        </>
      )}
    </main>
  );
}
