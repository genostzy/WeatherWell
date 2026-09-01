"use client";

import { BackLink } from "@/components/back-link";
import { EvacuationInstructions } from "@/features/evacuation/evacuation-instructions";
import { EmergencyCard } from "@/features/evacuation/emergency-card";
import { useSelectedZone } from "@/features/zones/use-selected-zone";

export default function EvacuationPage() {
  const zone = useSelectedZone();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <BackLink />
      <h1 className="text-lg font-semibold">Evacuation — {zone.name}</h1>
      <EvacuationInstructions zone={zone} />
      <EmergencyCard zone={zone} />
    </main>
  );
}
