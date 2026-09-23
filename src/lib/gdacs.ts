import type { LocalizedText } from "./types";

/**
 * Idea 16: the typhoon feed scrapes PAGASA's web page, which breaks whenever
 * their HTML changes. GDACS (the UN/EU disaster alert system) publishes
 * tropical cyclones as free JSON with no key; it is used only when PAGASA
 * cannot be read, and every reading says which source it came from. GDACS
 * has no PAGASA wind signals, so a GDACS reading never claims one.
 */
export interface GdacsCyclone {
  name: string;
  lat: number;
  lng: number;
  maxWindsKph: number | null;
  alertLevel: string;
  severityText: string;
  updatedAt: string;
  reportUrl: string | null;
}

/** PAGASA's area of responsibility, roughly: 5-25°N, 115-135°E. */
const PAR = { south: 5, north: 25, west: 115, east: 135 };

export function gdacsUrl(now: Date): string {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&fromDate=${day(from)}&toDate=${day(now)}`;
}

export function pickPhilippineCyclone(reply: unknown): GdacsCyclone | null {
  const features = (reply as { features?: unknown })?.features;
  if (!Array.isArray(features)) return null;
  for (const f of features as Array<{ geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> }>) {
    const p = f.properties ?? {};
    const coords = f.geometry?.coordinates;
    if (p.iscurrent !== "true" || !Array.isArray(coords)) continue;
    const [lng, lat] = coords as number[];
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    const countries = Array.isArray(p.affectedcountries) ? (p.affectedcountries as Array<{ iso3?: string }>) : [];
    const listsPh = countries.some((c) => c.iso3 === "PHL");
    const inPar = lat >= PAR.south && lat <= PAR.north && lng >= PAR.west && lng <= PAR.east;
    if (!listsPh && !inPar) continue;
    const severity = (p.severitydata ?? {}) as { severity?: unknown; severitytext?: unknown };
    return {
      name: String(p.eventname ?? p.name ?? "Tropical cyclone"),
      lat,
      lng,
      maxWindsKph: typeof severity.severity === "number" ? Math.round(severity.severity) : null,
      alertLevel: String(p.alertlevel ?? ""),
      severityText: String(severity.severitytext ?? ""),
      updatedAt: String(p.datemodified ?? ""),
      reportUrl: typeof (p.url as { report?: unknown })?.report === "string" ? (p.url as { report: string }).report : null,
    };
  }
  return null;
}

const GDACS_CATEGORY: LocalizedText = { en: "Tropical cyclone (GDACS)", fil: "Bagyo (GDACS)" };

/** A typhoon_tracks row for a GDACS reading, shaped like the PAGASA one. */
export function gdacsTrackRecord(c: GdacsCyclone, fetchedAt: string) {
  // GDACS timestamps are UTC without a zone designator.
  const issuedAt = c.updatedAt ? `${c.updatedAt.replace(/Z$/, "")}Z` : null;
  return {
    name: c.name,
    international_name: c.name,
    category: GDACS_CATEGORY,
    positions: [
      {
        lat: c.lat,
        lng: c.lng,
        description: c.severityText || null,
        outsidePar: false,
        maxWindsKph: c.maxWindsKph,
        gustinessKph: null,
        pressureHpa: null,
        movement: { direction: null, speedKph: null },
        time: issuedAt,
      },
    ],
    bulletin_number: null,
    is_final: false,
    issued_at: issuedAt,
    next_bulletin_at: null,
    headline: `PAGASA could not be reached; this reading is from GDACS (${c.alertLevel} alert). Follow PAGASA and your barangay for wind signals.`,
    max_winds_kph: c.maxWindsKph,
    gustiness_kph: null,
    pressure_hpa: null,
    movement_direction: null,
    movement_speed_kph: null,
    wind_signal: 0,
    signals: [],
    source: "GDACS",
    is_active: true,
    fetched_at: fetchedAt,
  };
}
