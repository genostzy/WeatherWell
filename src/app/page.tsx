"use client";

import Link from "next/link";
import { AlertCard } from "@/features/alerts/alert-card";
import { PredictionTimeline } from "@/features/alerts/prediction-timeline";
import { CascadeWarning } from "@/features/alerts/cascade-warning";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { useSelectedZone } from "@/features/zones/use-selected-zone";
import { Button } from "@/components/ui/button";
import {
  getActiveAlertForZone,
  getPredictionsForZone,
  getCascadeForZone,
  MOCK_ZONES,
} from "@/lib/mock-data";

export default function Home() {
  const zone = useSelectedZone();
  const alert = getActiveAlertForZone(zone.id);
  const predictions = getPredictionsForZone(zone.id);
  const cascade = getCascadeForZone(zone.id);
  const fromZone = cascade
    ? MOCK_ZONES.find((z) => z.id === cascade.fromZoneId)
    : undefined;

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-6">
      <OnboardingGate />
      <h1 className="text-lg font-semibold">WeatherWell alerts — {zone.name}</h1>
      <AlertCard alert={alert} zone={zone} />

      {predictions.length > 0 && (
        <PredictionTimeline steps={predictions} zoneName={zone.name} />
      )}

      {cascade && fromZone && (
        <CascadeWarning cascade={cascade} fromZone={fromZone} toZone={zone} />
      )}

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
        <Button asChild size="lg" variant="ghost">
          <Link href="/admin">Admin simulation</Link>
        </Button>
      </div>
    </main>
  );
}
