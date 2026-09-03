"use client";

import { BackLink } from "@/components/back-link";
import { EvacuationInstructions } from "@/features/evacuation/evacuation-instructions";
import { EmergencyCard } from "@/features/evacuation/emergency-card";
import { useSelectedZone } from "@/features/zones/use-selected-zone";

export default function EvacuationPage() {
  const zone = useSelectedZone();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-6 lg:p-8">
      <BackLink className="max-w-md lg:max-w-3xl" />
      <h1 className="text-lg font-semibold md:text-xl">Evacuation — {zone.name}</h1>
      <div className="grid w-full max-w-md gap-6 lg:max-w-3xl lg:grid-cols-2 lg:items-start">
        <EvacuationInstructions zone={zone} />
        <EmergencyCard zone={zone} />
      </div>
    </main>
  );
}
