"use client";

import { Marker, Popup } from "react-leaflet";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { useHistoricalEvents } from "@/lib/historical-events";
import { SEVERITY_LABEL } from "@/lib/severity";
import { createHistoricalEventMarkerIcon } from "./marker-icons";
import { HAZARD_TYPE_LABEL } from "./hazard-type-selector";
import type { Zone } from "@/lib/types";

/**
 * The optional "Historical Data Overlay" — past disaster occurrences,
 * fetched only while this is mounted (see useHistoricalEvents's own doc
 * comment on why). Located at each event's zone centroid: the source data
 * names an area, not coordinates, so this is deliberately the same
 * precision the hazard backdrop circles already use, not a false-precision
 * pin.
 */
export function HistoricalEventsLayer({ zones }: { zones: Zone[] }) {
  const { lang } = useLanguage();
  const zoneIds = zones.map((zone) => zone.id);
  const events = useHistoricalEvents(zoneIds);
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));

  return (
    <>
      {events.map((event) => {
        const zone = zoneById.get(event.zoneId);
        if (!zone) return null;
        const hazardLabel = t(HAZARD_TYPE_LABEL[event.hazardType], lang);
        const severityLabel = t(SEVERITY_LABEL[event.severity], lang);
        const label = `${hazardLabel} — ${severityLabel}`;
        return (
          <Marker
            key={event.id}
            position={[zone.lat, zone.lng]}
            icon={createHistoricalEventMarkerIcon(event.severity, label)}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <p className="font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.eventDate).toLocaleDateString(lang === "fil" ? "fil-PH" : "en-PH", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </p>
                {event.description[lang] && <p>{t(event.description, lang)}</p>}
                {event.source && <p className="text-xs text-muted-foreground">{event.source}</p>}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
