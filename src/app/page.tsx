import Link from "next/link";
import { AlertCard } from "@/features/alerts/alert-card";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { Button } from "@/components/ui/button";
import { MOCK_ZONES, getActiveAlertForZone } from "@/lib/mock-data";

export default function Home() {
  const zone = MOCK_ZONES[0];
  const alert = getActiveAlertForZone(zone.id);

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-6">
      <OnboardingGate />
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
