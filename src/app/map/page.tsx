import { BackLink } from "@/components/back-link";
import { ZoneMap } from "@/features/zones/zone-map";
import { MOCK_ZONES } from "@/lib/mock-data";

export default function MapPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-6">
      <BackLink />
      <h1 className="text-lg font-semibold">Zones</h1>
      <ZoneMap zones={MOCK_ZONES} />
    </main>
  );
}
