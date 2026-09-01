"use client";

import Link from "next/link";
import { AlertCard } from "@/features/alerts/alert-card";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { useSelectedZone } from "@/features/zones/use-selected-zone";
import { Button } from "@/components/ui/button";
import { getActiveAlertForZone } from "@/lib/mock-data";

export default function Home() {
  const zone = useSelectedZone();
  const alert = getActiveAlertForZone(zone.id);

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-6">
      <OnboardingGate />
      {/* The other screens all open with an <h1>; without this one the app's
          primary screen gives a screen reader no document structure at all. */}
      <h1 className="text-lg font-semibold">WeatherWell alerts — {zone.name}</h1>
      <AlertCard alert={alert} zone={zone} />

      {/* Progressive disclosure: evacuation is the one primary action;
          the rest are visibly secondary. */}
      <div className="flex w-full max-w-md flex-col gap-3">
        <Button asChild size="lg">
          <Link href="/evacuation">View evacuation instructions</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/report">Report water level</Link>
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link href="/map">View zone map</Link>
        </Button>
      </div>
    </main>
  );
}
