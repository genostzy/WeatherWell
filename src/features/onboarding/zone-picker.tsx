"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/features/i18n/language-provider";
import { t } from "@/lib/i18n";
import { APPROXIMATE_ACCURACY_METERS } from "@/lib/nearest-zone";
import type { LanguageCode, LocalizedText } from "@/lib/types";

/**
 * Just enough to display and confirm a choice — never the full Zone (route
 * text, hotline, evacuation center detail). Both /api/zones/search and
 * /api/zones/nearest return exactly this shape, on demand, so onboarding
 * never has to hold anything resembling the full ~42k-zone dataset just to
 * let a first-time resident pick their barangay.
 */
interface ZoneSummary {
  id: string;
  name: string;
  municipalityName: string;
  provinceName: string;
  lat: number;
  lng: number;
}

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

/** How long to wait after the last keystroke before firing a search request. */
const SEARCH_DEBOUNCE_MS = 250;

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
 * Expands common abbreviations and strips accents before the query reaches
 * the server's ILIKE match \u2014 "Brgy" -> "Barangay", etc. The server does the
 * actual matching now (GET /api/zones/search); this just keeps typing those
 * abbreviations working the way it did when matching was client-side.
 *
 * Deliberately does NOT touch comma/whitespace around it: the old
 * client-side filterZones normalized both the query and every candidate
 * zone's own text the same way, so collapsing "X, Y" to "X,Y" was safe on
 * both sides. The candidate side is now real, un-normalized zone names in
 * Postgres (always "Barangay X, Municipality" with the space) \u2014 doing it
 * only to the query would silently break the single most natural way
 * anyone types a full "barangay, municipality" search.
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bbrgy\.?\s*/g, "barangay ")
    .replace(/\bsta\.?\s+/g, "santa ")
    .replace(/\bsto\.?\s+/g, "santo ")
    .replace(/\bmt\.?\s+/g, "mount ")
    .replace(/\bgen\.?\s+/g, "general ")
    .trim();
}

interface ZoneSearchRow {
  id: string;
  name: string;
  municipality_name: string;
  province_name: string;
  lat: number;
  lng: number;
}

function toZoneSummary(row: ZoneSearchRow): ZoneSummary {
  return {
    id: row.id,
    name: row.name,
    municipalityName: row.municipality_name,
    provinceName: row.province_name,
    lat: row.lat,
    lng: row.lng,
  };
}

export function ZonePicker({ onSelect }: { onSelect: (zoneId: string) => void }) {
  const { lang } = useLanguage();
  // Starts empty so the user must make a real choice.
  const [selectedZone, setSelectedZone] = useState<ZoneSummary | null>(null);
  const [query, setQuery] = useState("");
  const [detection, setDetection] = useState<Detection>({ state: "idle" });
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState<ZoneSummary[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  // Distinguishes "still waiting on the debounced request" from "the request
  // came back empty" — without this, the empty search-results state during
  // the debounce window would flash "No barangays match" before the request
  // even fires.
  const [isSearching, setIsSearching] = useState(false);
  // The barangay a location fix proposed, if the current selection came from
  // one. A later fix that finds nothing near withdraws only that proposal —
  // never a barangay the resident chose by hand.
  // A ref, because the fix arrives in a callback after the tap: it must see
  // the selection as it is then, not as it was when the button was pressed.
  const proposedZoneId = useRef<string | null>(null);
  // Which read is current. A callback from an earlier read (one this screen
  // already gave up on) is ignored rather than proposing a barangay late.
  // Also covers the /api/zones/nearest round trip inside it — the read
  // isn't "settled" until that resolves too, so a give-up timer firing
  // mid-request still correctly makes a late response a no-op.
  const readCount = useRef(0);
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A slow search response arriving after a newer one must not overwrite it.
  const searchRequestId = useRef(0);

  useEffect(
    () => () => {
      if (giveUpTimer.current !== null) clearTimeout(giveUpTimer.current);
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    },
    []
  );

  // Wrapped in useCallback with stable deps (a ref and a state setter, both
  // guaranteed referentially stable by React) so detectLocation below is
  // stable too — otherwise the mount effect would refire on every render
  // detectLocation itself causes, re-attempting a location read in a loop.
  const withdrawProposal = useCallback(() => {
    const proposed = proposedZoneId.current;
    proposedZoneId.current = null;
    if (proposed !== null) {
      setSelectedZone((current) => (current?.id === proposed ? null : current));
    }
  }, []);

  function chooseByHand(zone: ZoneSummary) {
    proposedZoneId.current = null;
    setSelectedZone(zone);
    setQuery("");
    setShowResults(false);
    setSearchResults([]);
    setSearchTotal(0);
  }

  function handleSearchInput(value: string) {
    setQuery(value);
    setShowResults(true);
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);

    const q = value.trim();
    if (!q) {
      searchRequestId.current += 1;
      setIsSearching(false);
      setSearchResults([]);
      setSearchTotal(0);
      return;
    }

    setIsSearching(true);
    const thisRequest = ++searchRequestId.current;
    searchTimer.current = setTimeout(() => {
      fetch(`/api/zones/search?q=${encodeURIComponent(normalizeQuery(q))}&limit=${MAX_RESULTS}`)
        .then((res) => (res.ok ? res.json() : { results: [], total: 0 }))
        .then((body: { results: ZoneSearchRow[]; total: number }) => {
          // A newer search (or the field being cleared) already superseded this one.
          if (searchRequestId.current !== thisRequest) return;
          setIsSearching(false);
          setSearchResults(body.results.map(toZoneSummary));
          setSearchTotal(body.total);
        })
        .catch(() => {
          if (searchRequestId.current !== thisRequest) return;
          setIsSearching(false);
          setSearchResults([]);
          setSearchTotal(0);
        });
    }, SEARCH_DEBOUNCE_MS);
  }

  // useCallback with stable deps (withdrawProposal is itself stable; every
  // other value read here is a ref or a state setter) so the identity of
  // this function does not change across renders — the mount effect below
  // depends on it, and an unstable identity would re-attempt a location
  // read on every render this function itself causes.
  const detectLocation = useCallback(() => {
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
        fetch(`/api/zones/nearest?lat=${coords.latitude}&lng=${coords.longitude}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((body: { zone: ZoneSummary | null; distanceMeters: number | null; isNear: boolean } | null) => {
            if (!settle()) return;
            if (!body || !body.zone || body.distanceMeters === null) {
              withdrawProposal();
              setDetection({ state: "failed" });
              return;
            }
            const zone = body.zone;
            const approximate = coords.accuracy > APPROXIMATE_ACCURACY_METERS;
            if (body.isNear) {
              setSelectedZone(zone);
              proposedZoneId.current = zone.id;
              setDetection({ state: "near", zoneName: zone.name, distanceMeters: body.distanceMeters, approximate });
            } else {
              // Outside coverage: selecting the "nearest" would sign someone in
              // Davao up for Pangasinan's alerts. Say so, and let them choose.
              withdrawProposal();
              setDetection({ state: "far", distanceMeters: body.distanceMeters, approximate });
            }
          })
          .catch(() => {
            if (!settle()) return;
            withdrawProposal();
            setDetection({ state: "failed" });
          });
      },
      fail,
      { timeout: LOCATION_TIMEOUT_MS, maximumAge: LOCATION_MAX_AGE_MS }
    );
  }, [withdrawProposal]);

  // Attempted automatically rather than waiting for a tap: for a resident
  // who allows location this turns onboarding into a single Confirm press,
  // and it removes the wrong-barangay risk that a typed search carries
  // (Philippine barangay names repeat heavily — a mis-pick means a wrong
  // evacuation route). A denial or a failure just falls through to the
  // search box below, exactly as before.
  useEffect(() => {
    // Deferred to a microtask rather than called directly: detectLocation's
    // own no-geolocation branch calls setDetection synchronously, and doing
    // that straight from an effect body trips
    // react-hooks/set-state-in-effect's cascading-render warning. Queuing it
    // moves the state update out of the effect's own synchronous execution
    // without changing when the read is attempted in practice — this still
    // starts before the resident could possibly have tapped anything.
    queueMicrotask(() => {
      void detectLocation();
    });
  }, [detectLocation]);

  const displayResults = showResults ? searchResults : [];

  return (
    <div className="w-full max-w-md space-y-6" lang={lang}>
      <p className="text-sm text-muted-foreground">{t(COPY.intro, lang)}</p>

      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={detectLocation}
        loading={detection.state === "detecting"}
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
                setSelectedZone(null);
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
            onChange={(e) => handleSearchInput(e.target.value)}
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
              aria-selected={zone.id === selectedZone?.id}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-accent ${
                zone.id === selectedZone?.id ? "bg-accent" : ""
              }`}
              onMouseDown={(e) => {
                // Prevent blur from firing before click
                e.preventDefault();
                chooseByHand(zone);
              }}
            >
              <div className="flex flex-col">
                <span>{zone.name}</span>
                <span className="text-xs text-muted-foreground">{zone.municipalityName}, {zone.provinceName}</span>
              </div>
            </button>
          ))}
          {searchTotal > searchResults.length && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t(
                {
                  en: `Showing ${searchResults.length} of ${searchTotal} results — type more to narrow down.`,
                  fil: `Ipinapakita ang ${searchResults.length} sa ${searchTotal} result — mag-type pa para mapaliit.`,
                },
                lang
              )}
            </p>
          )}
        </div>
      )}

      {/* No results message — only once the request has actually come back empty */}
      {showResults && query.trim() && !isSearching && searchResults.length === 0 && (
        <p className="text-sm text-muted-foreground">{t(COPY.noResults, lang)}</p>
      )}

      <Button
        className="w-full"
        size="lg"
        disabled={!selectedZone}
        onClick={() => selectedZone && onSelect(selectedZone.id)}
      >
        {t(COPY.confirm, lang)}
      </Button>
    </div>
  );
}
