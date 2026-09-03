"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { getActiveAlertForZone } from "@/lib/mock-data";
import { getZoneStatus } from "@/lib/zone-status";
import { PersonalStatusHeadline } from "./personal-status-headline";
import { getBearingAndDistance } from "./bearing-distance";
import { useLivePosition } from "./use-live-position";
import { routeCrossesHazard } from "./route-hazard";
import type { HazardType, LocalizedText, Zone } from "@/lib/types";

const MapCanvas = dynamic(() => import("./map-canvas").then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <Skeleton className="h-[340px] w-full rounded-md sm:h-[400px] lg:h-[600px]" />,
});

const TO: LocalizedText = { en: "to", fil: "papunta sa" };
const PASSES_THROUGH_HAZARD: LocalizedText = {
  en: "Passes through a hazardous area",
  fil: "Dumadaan sa mapanganib na lugar",
};
const FIND_SAFE_AREA: LocalizedText = { en: "Find safe area", fil: "Hanapin ang ligtas na lugar" };
const FIND_SAFE_EVACUATION_CENTER: LocalizedText = {
  en: "Find safe evacuation center",
  fil: "Hanapin ang ligtas na evacuation center",
};
const NO_SAFE_AREA_FOUND: LocalizedText = {
  en: "No zone is currently Safe.",
  fil: "Walang zone na Ligtas sa ngayon.",
};
const NO_SAFE_ROUTE_FOUND: LocalizedText = {
  en: "Every route currently passes through a hazardous area.",
  fil: "Lahat ng ruta ay dumadaan sa mapanganib na lugar sa ngayon.",
};

/** Compass codes returned by `getBearingAndDistance` — Filipino uses distinct words, not abbreviations of the English letters. */
const COMPASS_LABEL: Record<string, LocalizedText> = {
  N: { en: "N", fil: "Hilaga" },
  NE: { en: "NE", fil: "Hilagang-Silangan" },
  E: { en: "E", fil: "Silangan" },
  SE: { en: "SE", fil: "Timog-Silangan" },
  S: { en: "S", fil: "Timog" },
  SW: { en: "SW", fil: "Timog-Kanluran" },
  W: { en: "W", fil: "Kanluran" },
  NW: { en: "NW", fil: "Hilagang-Kanluran" },
};

export function HomepageMap({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const [hazardType, setHazardType] = useState<HazardType>("flood");
  const [routeZoneId, setRouteZoneId] = useState<string | null>(zones[0]?.id ?? null);
  const [notice, setNotice] = useState<LocalizedText | null>(null);
  const livePosition = useLivePosition();

  const routeZone = zones.find((z) => z.id === routeZoneId) ?? null;
  const directionToSafety =
    routeZone && livePosition
      ? getBearingAndDistance(livePosition, {
          lat: routeZone.evacuationCenterLat,
          lng: routeZone.evacuationCenterLng,
        })
      : null;
  const routeHazard = routeZone ? routeCrossesHazard(routeZone, zones) : false;

  function handleSelectZone(zoneId: string) {
    setRouteZoneId(zoneId);
    setNotice(null);
  }

  function handleFindSafeArea() {
    const safeZone = zones.find((z) => getZoneStatus(getActiveAlertForZone(z.id)) === "safe");
    if (safeZone) {
      setRouteZoneId(safeZone.id);
      setNotice(null);
    } else {
      setNotice(NO_SAFE_AREA_FOUND);
    }
  }

  function handleFindSafeEvacuationCenter() {
    const safeRouteZone = zones.find((z) => !routeCrossesHazard(z, zones));
    if (safeRouteZone) {
      setRouteZoneId(safeRouteZone.id);
      setNotice(null);
    } else {
      setNotice(NO_SAFE_ROUTE_FOUND);
    }
  }

  return (
    <div className="grid w-full max-w-2xl gap-3 sm:gap-4 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <div className="lg:col-start-2 lg:row-start-1">
        <PersonalStatusHeadline zone={zones[0]} />
      </div>

      <div className="lg:col-start-1 lg:row-span-3">
        <MapCanvas
          zones={zones}
          hazardType={hazardType}
          onHazardTypeChange={setHazardType}
          routeZone={routeZone}
          routeHazard={routeHazard}
          onSelectZone={handleSelectZone}
        />
      </div>

      <div className="flex flex-wrap gap-2 lg:col-start-2 lg:row-start-2">
        <Button type="button" variant="outline" size="sm" onClick={handleFindSafeArea}>
          {t(FIND_SAFE_AREA, lang)}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleFindSafeEvacuationCenter}>
          {t(FIND_SAFE_EVACUATION_CENTER, lang)}
        </Button>
      </div>

      {(routeZone || notice) && (
        <p lang={lang} className="text-sm lg:col-start-2 lg:row-start-3">
          {routeZone && directionToSafety && (
            <span className="font-medium">
              {Math.round(directionToSafety.distanceMeters)}m{" "}
              {t(COMPASS_LABEL[directionToSafety.compassLabel], lang)} {t(TO, lang)}{" "}
              {routeZone.evacuationCenterName}
            </span>
          )}{" "}
          {routeZone && routeHazard && (
            <span className="rounded bg-severity-evacuate px-2 py-0.5 font-medium text-white">
              {t(PASSES_THROUGH_HAZARD, lang)}
            </span>
          )}
          {notice && <span className="text-muted-foreground">{t(notice, lang)}</span>}
        </p>
      )}
    </div>
  );
}
