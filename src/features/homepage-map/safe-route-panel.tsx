"use client";

import { Phone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/features/i18n/language-provider";
import { useAlerts } from "@/lib/alerts-store";
import { telHref } from "@/lib/barangay-details";
import { PIN_STATUS_LABEL } from "@/lib/community-pin";
import { t } from "@/lib/i18n";
import type { LatLng, RouteProblem } from "@/lib/safe-route";
import { SEVERITY_LABEL } from "@/lib/severity";
import type { LocalizedText, Zone } from "@/lib/types";
import { hotlinesOf } from "@/lib/zone-data-quality";
import { getBearingAndDistance } from "./bearing-distance";
import type { SafeRoute } from "./use-safe-route";

const PANEL_LABEL: LocalizedText = { en: "Directions to a safe place", fil: "Direksyon papunta sa ligtas na lugar" };
const SEARCHING: LocalizedText = { en: "Finding the nearest safe place…", fil: "Hinahanap ang pinakamalapit na ligtas na lugar…" };
const NOT_CONFIRMED: LocalizedText = { en: "Not confirmed by your barangay", fil: "Hindi pa kumpirmado ng barangay" };
const CHECKED: LocalizedText = {
  en: "Avoids barangays under Warning or Evacuate and blocked roads reported by residents",
  fil: "Iniiwasan ang barangay na may Warning o Evacuate at mga saradong daan na iniulat ng residente",
};
const FROM_BARANGAY: LocalizedText = {
  en: "From your barangay — turn on location for directions from where you are",
  fil: "Mula sa iyong barangay — i-on ang lokasyon para sa direksyon mula sa kinaroroonan mo",
};
const OFFLINE: LocalizedText = { en: "Offline — straight line, not a road route", fil: "Offline — tuwid na linya, hindi daan" };
const STRAIGHT_LINE: LocalizedText = {
  en: "Straight line — the route planner didn't answer",
  fil: "Tuwid na linya — hindi sumagot ang route planner",
};
const NO_CENTRE: LocalizedText = {
  en: "No evacuation centre found near you — go to higher ground and call your barangay or 911",
  fil: "Walang evacuation center na malapit sa iyo — pumunta sa mas mataas na lugar at tumawag sa barangay o 911",
};
const NO_AREA: LocalizedText = {
  en: "No alert-free barangay within 10 km — go to higher ground and call your barangay or 911",
  fil: "Walang barangay na walang alerto sa loob ng 10 km — pumunta sa mas mataas na lugar at tumawag sa barangay o 911",
};
const RECALCULATE: LocalizedText = { en: "Recalculate", fil: "Kalkulahin muli" };
const AN_ALERT: LocalizedText = { en: "an alert", fil: "alerto" };
const TO: LocalizedText = { en: "to", fil: "papunta sa" };

/** Compass codes returned by `getBearingAndDistance` */
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

const nearestArea = (name: string): LocalizedText => ({
  en: `Nearest barangay with no alert: ${name}`,
  fil: `Pinakamalapit na barangay na walang alerto: ${name}`,
});
const walkLine = (distance: string, minutes: number, name: string): LocalizedText => ({
  en: `${distance} · ${minutes} min walk to ${name}`,
  fil: `${distance} · ${minutes} minutong lakad papunta sa ${name}`,
});
const passesPin = (type: LocalizedText, metres: number): LocalizedText => ({
  en: `This route passes a ${type.en} pin (about ${metres} m from you)`,
  fil: `Dumadaan ang rutang ito sa ${type.fil} pin (mga ${metres} m mula sa iyo)`,
});
const passesZone = (barangay: string, alert: LocalizedText): LocalizedText => ({
  en: `This route passes near ${barangay}, under ${alert.en}`,
  fil: `Dumadaan ang rutang ito malapit sa ${barangay}, na may ${alert.fil}`,
});
const callLabel = (number: string): LocalizedText => ({ en: `Call ${number}`, fil: `Tumawag sa ${number}` });

function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

const problemClass = "rounded bg-severity-evacuate/20 px-2 py-0.5 font-medium text-severity-evacuate";

/**
 * What "Find safe evacuation center", "Find safe area" and a marker tap found:
 * the place, the walk, what was checked on it or what it passes, and a way to
 * call. Sits under the two buttons, where the resident just tapped.
 */
export function SafeRoutePanel({
  route,
  action,
  startZone,
  livePosition,
}: {
  route: SafeRoute;
  /** Which button made the result: the "nothing found" text differs between them. Null for a marker tap. */
  action: "safe-area" | "evac-centre" | null;
  /** Where the resident is, or failing that their own barangay: whose hotline the call button dials. */
  startZone: Zone;
  livePosition: LatLng | null;
}) {
  const { lang } = useLanguage();
  const alerts = useAlerts();
  const { result, searching, fromBarangay, offline, recalculate } = route;
  if (!searching && !result) return null;

  const activeAlertLabel = (zone: Zone): LocalizedText => {
    const alert = alerts.find((a) => a.zoneId === zone.id && a.isActive);
    return alert ? SEVERITY_LABEL[alert.severity] : AN_ALERT;
  };

  function problemLine(problem: RouteProblem): { key: string; text: LocalizedText } {
    return problem.kind === "pin"
      ? { key: `pin-${problem.pin.id}`, text: passesPin(PIN_STATUS_LABEL[problem.pin.statusTag], problem.metresFromStart) }
      : { key: `zone-${problem.zone.id}`, text: passesZone(problem.zone.name, activeAlertLabel(problem.zone)) };
  }

  const found = result?.status === "found" ? result : null;
  const destination = found?.destination;
  const metres = found?.route?.distanceMeters ?? null;
  const seconds = found?.route?.durationSeconds ?? null;
  // A straight line has neither; then the compass line is the whole answer.
  const walk = metres !== null && seconds !== null ? { metres, minutes: Math.max(1, Math.round(seconds / 60)) } : null;
  // The live compass line: from where the phone is, else from the barangay's point. It moves as the resident does.
  const direction = destination ? getBearingAndDistance(livePosition ?? startZone, destination) : null;
  const number = hotlinesOf(startZone)[0] ?? "911";

  return (
    <section
      aria-label={t(PANEL_LABEL, lang)}
      aria-busy={searching}
      aria-live="polite"
      className="space-y-2 rounded-xl border-2 border-border p-3 text-sm"
    >
      {searching && (
        <p lang={lang} className="text-muted-foreground">
          {t(SEARCHING, lang)}
        </p>
      )}

      {!searching && result && !found && (
        <p lang={lang} className="font-medium break-words">
          {t(action === "safe-area" ? NO_AREA : NO_CENTRE, lang)}
        </p>
      )}

      {!searching && found && destination && (
        <>
          {destination.kind === "area" && action === "safe-area" && (
            <p lang={lang} className="font-medium break-words">
              {t(nearestArea(destination.name), lang)}
            </p>
          )}
          {walk && (
            <p lang={lang} className="font-medium break-words">
              {t(walkLine(formatDistance(walk.metres), walk.minutes, destination.name), lang)}
            </p>
          )}
          {direction && (
            <p lang={lang} className={walk ? "break-words text-muted-foreground" : "font-medium break-words"}>
              {`${Math.round(direction.distanceMeters)}m ${t(COMPASS_LABEL[direction.compassLabel], lang)} ${t(TO, lang)} ${destination.name}`}
            </p>
          )}
          {destination.kind === "likely" && (
            <p lang={lang} className="font-medium">
              {t(NOT_CONFIRMED, lang)}
            </p>
          )}
          {fromBarangay && (
            <p lang={lang} className="text-muted-foreground">
              {t(FROM_BARANGAY, lang)}
            </p>
          )}
          {offline && (
            <p lang={lang} className="text-muted-foreground">
              {t(OFFLINE, lang)}
            </p>
          )}
          {!offline && found.fallback && (
            <p lang={lang} className="text-muted-foreground">
              {t(STRAIGHT_LINE, lang)}
            </p>
          )}
          {!offline && !found.fallback && found.problems.length === 0 && (
            <p lang={lang} className="text-muted-foreground">
              {t(CHECKED, lang)}
            </p>
          )}
          {!offline && !found.fallback && found.problems.length > 0 && (
            <ul className="space-y-1">
              {found.problems.map((problem) => {
                const { key, text } = problemLine(problem);
                return (
                  <li key={key} lang={lang} className={problemClass}>
                    {t(text, lang)}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {!searching && result && (
        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
          <a
            href={telHref(number)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-border px-4 text-sm font-bold outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring"
          >
            <Phone aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span lang={lang}>{t(callLabel(number), lang)}</span>
          </a>
          <Button type="button" variant="outline" size="lg" onClick={recalculate} className="rounded-xl border-2 text-sm font-bold">
            <RefreshCw aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span lang={lang}>{t(RECALCULATE, lang)}</span>
          </Button>
        </div>
      )}
    </section>
  );
}
