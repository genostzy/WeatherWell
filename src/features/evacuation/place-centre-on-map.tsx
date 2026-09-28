"use client";

import { useState } from "react";
import { Marker, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapShell } from "@/features/map/map-shell";
import { MapCentrePlacer } from "@/features/map/map-centre-placer";
import { createEvacuationMarkerIcon } from "@/features/map/marker-icons";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { hasRealEvacuationCenter } from "@/lib/zone-data-quality";
import { CAPACITY, SAVED } from "./centre-copy";
import type { LanguageCode, LocalizedText, Zone } from "@/lib/types";

const MAP_LABEL: LocalizedText = {
  en: "Map for placing the evacuation centre",
  fil: "Mapa para ilagay ang evacuation center",
};
const PLACE_AT_CENTRE: LocalizedText = { en: "Place at the map's centre", fil: "Ilagay sa gitna ng mapa" };
const HINT: LocalizedText = {
  en: "Tap where the centre is, or move the map and use Place at the map's centre.",
  fil: "I-tap kung nasaan ang center, o igalaw ang mapa at gamitin ang Ilagay sa gitna ng mapa.",
};
const NAME: LocalizedText = { en: "Centre name", fil: "Pangalan ng center" };
const SAVE: LocalizedText = { en: "Save centre", fil: "I-save ang center" };
const SPOT: LocalizedText = { en: "The evacuation centre goes here", fil: "Dito ang evacuation center" };

/** A tap on the map, or, without a pointer, the map's centre (WCAG 2.1.1), sets the spot. */
function SpotPlacer({ onPlace, lang }: { onPlace: (lat: number, lng: number) => void; lang: LanguageCode }) {
  useMapEvents({
    click(event) {
      onPlace(event.latlng.lat, event.latlng.lng);
    },
  });
  return <MapCentrePlacer onPlace={onPlace} label={t(PLACE_AT_CENTRE, lang)} />;
}

/**
 * For an official whose centre OpenStreetMap does not know: put it on the
 * map by hand. Saved through confirm_evacuation_center, which keeps its
 * checks (the official manages the barangay; within 5 km of it).
 */
export function PlaceCentreOnMap({ zone }: { zone: Zone }) {
  const { lang } = useLanguage();
  const real = hasRealEvacuationCenter(zone);
  const [spot, setSpot] = useState<[number, number] | null>(
    real ? [zone.evacuationCenterLat, zone.evacuationCenterLng] : null
  );
  const [name, setName] = useState(real ? zone.evacuationCenterName : "");
  const [capacity, setCapacity] = useState(
    real && zone.evacuationCenterCapacity > 0 ? String(zone.evacuationCenterCapacity) : ""
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!spot || name.trim() === "") return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const { confirmEvacuationCenter } = await import("@/app/actions/confirm-evacuation-center");
      const result = await confirmEvacuationCenter({
        zoneId: zone.id,
        name: name.trim(),
        lat: spot[0],
        lng: spot[1],
        capacity: Number(capacity || 0),
      });
      if (result.ok) setNotice(t(SAVED, lang));
      else setError(friendlyError(result.error, lang));
    } catch (caught) {
      setError(friendlyError(caught instanceof Error ? caught.message : String(caught), lang));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p lang={lang} className="text-xs text-muted-foreground">
        {t(HINT, lang)}
      </p>
      <MapShell
        center={[zone.evacuationCenterLat, zone.evacuationCenterLng]}
        ariaLabel={t(MAP_LABEL, lang)}
        className="cursor-crosshair"
        controlsPosition="topright"
      >
        <SpotPlacer onPlace={(lat, lng) => setSpot([lat, lng])} lang={lang} />
        {spot && <Marker position={spot} icon={createEvacuationMarkerIcon(name.trim() || t(SPOT, lang))} />}
      </MapShell>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={`centre-name-${zone.id}`} lang={lang}>
            {t(NAME, lang)}
          </Label>
          <Input
            id={`centre-name-${zone.id}`}
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`centre-capacity-${zone.id}`} lang={lang}>
            {t(CAPACITY, lang)}
          </Label>
          <Input
            id={`centre-capacity-${zone.id}`}
            type="number"
            inputMode="numeric"
            min={0}
            className="w-32"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </div>
        <Button type="button" disabled={!spot || name.trim() === ""} loading={saving} onClick={() => void save()}>
          <span lang={lang}>{t(SAVE, lang)}</span>
        </Button>
      </div>
      {notice && (
        <p role="status" lang={lang} className="text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" lang={lang} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
