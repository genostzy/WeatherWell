import { BackLink } from "@/components/back-link";
import { ZoneMap } from "@/features/zones/zone-map";
import { MOCK_ZONES } from "@/lib/mock-data";

export default function MapPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-4 sm:p-6 lg:p-8">
      <BackLink className="max-w-md md:max-w-2xl lg:max-w-4xl" />
      <h1 className="text-lg font-semibold md:text-xl">Zones</h1>
      <ZoneMap zones={MOCK_ZONES} />
    </main>
  );
}
