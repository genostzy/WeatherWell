"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
    en: "Couldn't get your location — choose your barangay below.",
    fil: "Hindi nakuha ang iyong lokasyon — piliin ang iyong barangay sa ibaba.",
  },
  confirm: { en: "Confirm barangay", fil: "Kumpirmahin ang barangay" },
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
  const [detection, setDetection] = useState<Detection>({ state: "idle" });
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

      <RadioGroup value={selected} onValueChange={chooseByHand}>
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
        {t(COPY.confirm, lang)}
      </Button>
    </div>
  );
}
