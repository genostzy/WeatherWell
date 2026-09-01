import { MapPin } from "lucide-react";
import type { Zone } from "@/lib/types";

export function ZoneMap({ zones }: { zones: Zone[] }) {
  return (
    <div className="grid w-full max-w-md gap-3">
      {zones.map((zone) => (
        <div
          key={zone.id}
          data-testid="zone-region"
          className="flex items-start gap-3 rounded-md border-2 border-foreground/25 p-4"
        >
          <MapPin aria-hidden="true" className="h-6 w-6 shrink-0" />
          <div>
            <p className="font-medium">{zone.name}</p>
            <p className="text-sm text-muted-foreground">{zone.evacuationCenterName}</p>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Placeholder layout — real barangay boundary data lands in Phase 2.
      </p>
    </div>
  );
}
