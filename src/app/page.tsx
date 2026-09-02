"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Building2, Droplet, Map, Settings } from "lucide-react";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { ZoneAlertListFallback } from "@/features/homepage-map/zone-alert-list-fallback";
import { useIsOnline } from "@/features/homepage-map/use-tiles-cached";
import { MOCK_ZONES } from "@/lib/mock-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const HomepageMap = dynamic(
  () => import("@/features/homepage-map/homepage-map").then((m) => m.HomepageMap),
  { ssr: false, loading: () => <Skeleton className="h-[400px] w-full max-w-2xl rounded-md" /> }
);

const NAV_LINKS = [
  { href: "/evacuation", label: "Evacuation", icon: Building2 },
  { href: "/report", label: "Report", icon: Droplet },
  { href: "/map", label: "Zone map", icon: Map },
  { href: "/admin", label: "Admin", icon: Settings },
] as const;

export default function Home() {
  const isOnline = useIsOnline();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <OnboardingGate />
      <h1 className="text-lg font-semibold">WeatherWell</h1>
      {isOnline ? <HomepageMap zones={MOCK_ZONES} /> : <ZoneAlertListFallback zones={MOCK_ZONES} />}

      <div className="flex w-full max-w-2xl flex-wrap justify-center gap-2">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => (
          <Button key={href} asChild variant="ghost" size="sm">
            <Link href={href}>
              <Icon aria-hidden="true" />
              {label}
            </Link>
          </Button>
        ))}
      </div>
    </main>
  );
}
