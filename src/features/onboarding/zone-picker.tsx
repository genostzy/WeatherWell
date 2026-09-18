"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { APPROXIMATE_ACCURACY_METERS, findNearestZone } from "@/lib/nearest-zone";
import type { LanguageCode, LocalizedText, Zone } from "@/lib/types";

/**
 * How long the device may spend on one location read, and how old a fix it
 * may hand back from its own cache. A resident indoors with no GPS would
 * otherwise wait on a call that never settles.
 */
const LOCATION_TIMEOUT_MS = 15_000;
const LOCATION_MAX_AGE_MS = 60_000;

/**
 * When this screen gives up on a read itself. Some devices never call back
 * at all, timeout option or not, and the button stays disabled while a read
 * is in flight. Longer than LOCATION_TIMEOUT_MS because the device only
 * starts that clock once the permission prompt has been answered.
 */
const LOCATION_GIVE_UP_MS = 30_000;

/** Maximum number of search results to render (avoid DOM overload with 42k zones). */
const MAX_RESULTS = 20;

type Detection =
  | { state: "idle" }
  | { state: "detecting" }
  | { state: "near"; zoneName: string; distanceMeters: number; approximate: boolean }
  | { state: "far"; distanceMeters: number; approximate: boolean }
  | { state: "failed" };

const COPY = {
  intro: {
    en: "Choose your barangay so alerts and evacuation instructions match your area.",
    fil: "Piliin ang iyong barangay upang ang mga alerto at gabay sa paglikas ay tumugma sa iyong lugar.",
  },
  useLocation: { en: "Use my location", fil: "Gamitin ang aking lokasyon" },
  detecting: { en: "Finding your location…", fil: "Hinahanap ang iyong lokasyon…" },
  approximate: { en: "Your location is approximate.", fil: "Tinatayang lokasyon ang nakuha." },
  failed: {
    en: "Couldn't get your location — search for your barangay below.",
    fil: "Hindi nakuha ang iyong lokasyon — hanapin ang iyong barangay sa ibaba.",
  },
  searchPlaceholder: {
    en: "Search by barangay, municipality, or province…",
    fil: "Maghanap ayon sa pangalan ng barangay, munisipalidad, o probinsya…",
  },
  noResults: {
    en: "No barangays match your search.",
    fil: "Walang barangay na tumutugma sa iyong paghahanap.",
  },
  confirm: { en: "Confirm barangay", fil: "Kumpirmahin ang barangay" },
  selected: { en: "Selected:", fil: "Napili:" },
  change: { en: "Change", fil: "Baguhin" },
} satisfies Record<string, LocalizedText>;

function formatDistance(meters: number, lang: LanguageCode): string {
  if (meters < 1000) return t({ en: "less than 1 km", fil: "mas mababa sa 1 km" }, lang);
  const km = meters < 10_000 ? (meters / 1000).toFixed(1) : String(Math.round(meters / 1000));
  return `${km} km`;
}

function nearMessage(zoneName: string, meters: number, lang: LanguageCode): string {
  const distance = formatDistance(meters, lang);
  return t(
    {
      en: `Closest barangay we cover: ${zoneName}, about ${distance} away. Is this yours? Change it below if not.`,
      fil: `Pinakamalapit na barangay na sakop ng WeatherWell: ${zoneName}, mga ${distance} ang layo. Ito ba ang iyong barangay? Baguhin sa ibaba kung hindi.`,
    },
    lang
  );
}

function farMessage(meters: number, lang: LanguageCode): string {
  const distance = formatDistance(meters, lang);
  return t(
    {
      en: `You're about ${distance} from the nearest barangay WeatherWell covers. We don't cover your area yet — you can still choose one below.`,
      fil: `Mga ${distance} ang layo mo mula sa pinakamalapit na barangay na sakop ng WeatherWell. Hindi pa sakop ang iyong lugar — maaari mo pa ring pumili sa ibaba.`,
    },
    lang
  );
}

/**
 * Filter zones by search query. Matches against zone name, municipality,
 * and province. Case-insensitive, accent-insensitive.
 * Normalizes common abbreviations so "Brgy" matches "Barangay", etc.
 */
function filterZones(zones: readonly Zone[], query: string): Zone[] {
  if (!query.trim()) return [];
  const normalised = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bbrgy\.?\s*/g, "barangay ")
    .replace(/\bsta\.?\s+/g, "santa ")
    .replace(/\bsto\.?\s+/g, "santo ")
    .replace(/\bmt\.?\s+/g, "mount ")
    .replace(/\bgen\.?\s+/g, "general ")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  return zones.filter((zone) => {
    const searchable = `${zone.name} ${zone.municipalityName} ${zone.provinceName}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s*,\s*/g, ",")
      .replace(/\s+/g, " ")
      .trim();
    return searchable.includes(normalised);
  });
}

export function ZonePicker({
  zones,
  onSelect,
}: {
  zones: Zone[];
  onSelect: (zoneId: string) => void;
}) {
  const { lang } = useLanguage();
  // Starts empty so the user must make a real choice.
  const [selected, setSelected] = useState<string>("");
  const [query, setQuery] = useState("");
  const [detection, setDetection] = useState<Detection>({ state: "idle" });
  const [showResults, setShowResults] = useState(false);
  // The barangay a location fix proposed, if the current selection came from
  // one. A later fix that finds nothing near withdraws only that proposal —
  // never a barangay the resident chose by hand.
  // A ref, because the fix arrives in a callback after the tap: it must see
  // the selection as it is then, not as it was when the button was pressed.
  const proposedZoneId = useRef<string | null>(null);
  // Which read is current. A callback from an earlier read (one this screen
  // already gave up on) is ignored rather than proposing a barangay late.
  const readCount = useRef(0);
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (giveUpTimer.current !== null) clearTimeout(giveUpTimer.current);
    },
    []
  );

  function withdrawProposal() {
    const proposed = proposedZoneId.current;
    proposedZoneId.current = null;
    if (proposed !== null) setSelected((current) => (current === proposed ? "" : current));
  }

  function chooseByHand(zoneId: string) {
    proposedZoneId.current = null;
    setSelected(zoneId);
    setQuery("");
    setShowResults(false);
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      withdrawProposal();
      setDetection({ state: "failed" });
      return;
    }

    setDetection({ state: "detecting" });

    const thisRead = ++readCount.current;
    // True exactly once, for the current read: the first of success, error
    // or the give-up timer wins, and everything after it is ignored.
    const settle = (): boolean => {
      if (readCount.current !== thisRead) return false;
      readCount.current += 1;
      if (giveUpTimer.current !== null) {
        clearTimeout(giveUpTimer.current);
        giveUpTimer.current = null;
      }
      return true;
    };
    const fail = () => {
      if (!settle()) return;
      withdrawProposal();
      setDetection({ state: "failed" });
    };

    if (giveUpTimer.current !== null) clearTimeout(giveUpTimer.current);
    giveUpTimer.current = setTimeout(fail, LOCATION_GIVE_UP_MS);

    // One read, not a watch, and nothing is stored — the consent notice's
    // promise. The fix only ever proposes; the resident still confirms.
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!settle()) return;
        const match = findNearestZone({ lat: coords.latitude, lng: coords.longitude }, zones);
        if (!match) {
          withdrawProposal();
          setDetection({ state: "failed" });
          return;
        }
        const approximate = coords.accuracy > APPROXIMATE_ACCURACY_METERS;
        if (match.isNear) {
          setSelected(match.zone.id);
          proposedZoneId.current = match.zone.id;
          setDetection({ state: "near", zoneName: match.zone.name, distanceMeters: match.distanceMeters, approximate });
        } else {
          // Outside coverage: selecting the "nearest" would sign someone in
          // Davao up for Pangasinan's alerts. Say so, and let them choose.
          withdrawProposal();
          setDetection({ state: "far", distanceMeters: match.distanceMeters, approximate });
        }
      },
      fail,
      { timeout: LOCATION_TIMEOUT_MS, maximumAge: LOCATION_MAX_AGE_MS }
    );
  }

  const results = filterZones(zones, query);
  const selectedZone = zones.find((z) => z.id === selected);
  const displayResults = showResults ? results.slice(0, MAX_RESULTS) : [];

  return (
    <div className="w-full max-w-md space-y-6" lang={lang}>
      <p className="text-sm text-muted-foreground">{t(COPY.intro, lang)}</p>

      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={handleUseMyLocation}
        disabled={detection.state === "detecting"}
      >
        {t(COPY.useLocation, lang)}
      </Button>

      <div aria-live="polite" className="space-y-1 text-sm">
        {detection.state === "detecting" && <p>{t(COPY.detecting, lang)}</p>}
        {detection.state === "near" && <p>{nearMessage(detection.zoneName, detection.distanceMeters, lang)}</p>}
        {detection.state === "far" && <p>{farMessage(detection.distanceMeters, lang)}</p>}
        {(detection.state === "near" || detection.state === "far") && detection.approximate && (
          <p className="text-muted-foreground">{t(COPY.approximate, lang)}</p>
        )}
        {detection.state === "failed" && <p className="text-muted-foreground">{t(COPY.failed, lang)}</p>}
      </div>

      {/* Selected zone display */}
      {selectedZone && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-muted-foreground">{t(COPY.selected, lang)}</span>
              <p className="font-medium">{selectedZone.name}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected("");
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              {t(COPY.change, lang)}
            </Button>
          </div>
        </div>
      )}

      {/* Search input */}
      {!selectedZone && (
        <div className="space-y-2">
          <Label htmlFor="zone-search">{t({ en: "Search barangay", fil: "Maghanap ng barangay" }, lang)}</Label>
          <Input
            ref={inputRef}
            id="zone-search"
            placeholder={t(COPY.searchPlaceholder, lang)}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            onBlur={() => {
              // Delay to allow click on result before hiding
              setTimeout(() => setShowResults(false), 200);
            }}
            autoComplete="off"
          />
        </div>
      )}

      {/* Search results */}
      {displayResults.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-md border" role="listbox">
          {displayResults.map((zone) => (
            <button
              key={zone.id}
              type="button"
              role="option"
              aria-selected={zone.id === selected}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-accent ${
                zone.id === selected ? "bg-accent" : ""
              }`}
              onMouseDown={(e) => {
                // Prevent blur from firing before click
                e.preventDefault();
                chooseByHand(zone.id);
              }}
            >
              <div className="flex flex-col">
                <span>{zone.name}</span>
                <span className="text-xs text-muted-foreground">{zone.municipalityName}, {zone.provinceName}</span>
              </div>
            </button>
          ))}
          {results.length > MAX_RESULTS && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t(
                {
                  en: `Showing ${MAX_RESULTS} of ${results.length} results — type more to narrow down.`,
                  fil: `Ipinapakita ang ${MAX_RESULTS} sa ${results.length} result — mag-type pa para mapaliit.`,
                },
                lang
              )}
            </p>
          )}
        </div>
      )}

      {/* No results message */}
      {showResults && query.trim() && results.length === 0 && (
        <p className="text-sm text-muted-foreground">{t(COPY.noResults, lang)}</p>
      )}

      <Button
        className="w-full"
        size="lg"
        disabled={!selected}
        onClick={() => selected && onSelect(selected)}
      >
        {t(COPY.confirm, lang)}
      </Button>
    </div>
  );
}
