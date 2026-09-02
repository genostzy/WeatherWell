"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Building2, Droplet, Map, Settings } from "lucide-react";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { ZoneAlertListFallback } from "@/features/homepage-map/zone-alert-list-fallback";
import { useIsOnline } from "@/features/homepage-map/use-tiles-cached";
import { useSelectedZone } from "@/features/zones/use-selected-zone";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { MOCK_ZONES } from "@/lib/mock-data";
import { orderZonesWithSelectedFirst } from "@/lib/order-zones";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { LocalizedText } from "@/lib/types";

const HomepageMap = dynamic(
  () => import("@/features/homepage-map/homepage-map").then((m) => m.HomepageMap),
  { ssr: false, loading: () => <Skeleton className="h-[400px] w-full max-w-2xl rounded-md" /> }
);

const NAV_LINKS: { href: string; label: LocalizedText; icon: typeof Building2 }[] = [
  { href: "/evacuation", label: { en: "Evacuation", fil: "Evacuation" }, icon: Building2 },
  { href: "/report", label: { en: "Report", fil: "Ulat" }, icon: Droplet },
  { href: "/map", label: { en: "Map", fil: "Mapa" }, icon: Map },
  { href: "/admin", label: { en: "Admin", fil: "Admin" }, icon: Settings },
];

export default function Home() {
  const isOnline = useIsOnline();
  const selectedZone = useSelectedZone();
  const orderedZones = orderZonesWithSelectedFirst(MOCK_ZONES, selectedZone.id);
  const { lang } = useLanguage();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <OnboardingGate />
      <h1 className="text-lg font-semibold">WeatherWell</h1>
      {isOnline ? (
        <HomepageMap zones={orderedZones} />
      ) : (
        <ZoneAlertListFallback zones={orderedZones} />
      )}

      <div className="flex w-full max-w-2xl flex-wrap justify-center gap-2">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => (
          <Button key={href} asChild variant="ghost" size="sm">
            <Link href={href}>
              <Icon aria-hidden="true" />
              {t(label, lang)}
            </Link>
          </Button>
        ))}
      </div>
    </main>
  );
}
