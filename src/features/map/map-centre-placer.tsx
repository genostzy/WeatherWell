"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { Crosshair } from "lucide-react";
import { useMap } from "react-leaflet";
import { Button } from "@/components/ui/button";

/**
 * Placing something on a map without a pointer (WCAG 2.1.1): the arrow keys
 * move a focused Leaflet map, and this places at its centre, marked by the
 * crosshair. Mounted only while placing, inside the MapContainer.
 */
export function MapCentrePlacer({ onPlace, label }: { onPlace: (lat: number, lng: number) => void; label: string }) {
  const map = useMap();
  const control = useRef<HTMLDivElement>(null);

  // Leaflet hears a click on its container before React does, so without
  // this a press of the button also counts as a click on the map under it.
  useEffect(() => {
    if (control.current) L.DomEvent.disableClickPropagation(control.current);
  }, []);

  return (
    <>
      <Crosshair
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 z-[1000] h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-foreground drop-shadow"
      />
      {/* Just under the crosshair, clear of the controls along the map's edges. */}
      <div ref={control} className="absolute top-1/2 left-1/2 z-[1000] mt-6 -translate-x-1/2">
        <Button
          type="button"
          size="sm"
          className="shadow-md"
          onClick={() => {
            const centre = map.getCenter();
            onPlace(centre.lat, centre.lng);
          }}
        >
          {label}
        </Button>
      </div>
    </>
  );
}
