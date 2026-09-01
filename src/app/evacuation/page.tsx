import { EvacuationInstructions } from "@/features/evacuation/evacuation-instructions";
import { MOCK_ZONES } from "@/lib/mock-data";

export default function EvacuationPage() {
  const zone = MOCK_ZONES[0];

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <h1 className="text-lg font-semibold">Evacuation — {zone.name}</h1>
      <EvacuationInstructions zone={zone} />
    </main>
  );
}
