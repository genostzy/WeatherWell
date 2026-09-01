"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Zone } from "@/lib/types";

type DetectionState = "idle" | "detecting" | "detected" | "failed";

export function ZonePicker({
  zones,
  onSelect,
}: {
  zones: Zone[];
  onSelect: (zoneId: string) => void;
}) {
  // Starts empty so the user must make a real choice.
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [detection, setDetection] = useState<DetectionState>("idle");

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setDetection("failed");
      return;
    }

    setDetection("detecting");
    navigator.geolocation.getCurrentPosition(
      () => {
        // Phase 1 ships no real boundary polygons — matching a fix to a
        // barangay lands with the GeoRisk/PSGC data in Phase 2. Until then a
        // successful fix proposes the first zone and the user can correct it.
        setSelected(zones[0]?.id);
        setDetection("detected");
      },
      () => setDetection("failed")
    );
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <p className="text-sm text-muted-foreground">
        Choose your barangay so alerts and evacuation instructions match your area.
      </p>

      <Button type="button" variant="outline" size="lg" onClick={handleUseMyLocation}>
        Use my location
      </Button>

      {detection === "detected" && (
        <p className="text-sm">
          Detected: {zones.find((z) => z.id === selected)?.name} — change it below if
          that is wrong.
        </p>
      )}
      {detection === "failed" && (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t detect your zone automatically — pick it below.
        </p>
      )}

      <RadioGroup value={selected} onValueChange={setSelected}>
        {zones.map((zone) => (
          <div key={zone.id} className="flex items-center space-x-3 py-2">
            <RadioGroupItem value={zone.id} id={zone.id} />
            <Label htmlFor={zone.id} className="text-base">
              {zone.name}
            </Label>
          </div>
        ))}
      </RadioGroup>

      <Button
        className="w-full"
        size="lg"
        disabled={!selected}
        onClick={() => selected && onSelect(selected)}
      >
        Confirm zone
      </Button>
    </div>
  );
}
