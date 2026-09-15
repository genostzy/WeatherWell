import { SEVERITY_ORDER, SEVERITY_LABEL, type Severity } from "./severity";
import { CENTER_STATUS_LABEL } from "./center-status";
import { t } from "./i18n";
import type { LanguageCode, LocalizedText } from "./types";
import type { OfficialAction } from "./official-actions-mapper";

/**
 * One sentence describing an official_actions entry, in the requested
 * language. Severities use SEVERITY_LABEL — "Lowered to Advisory", the same
 * word the SeverityBadge beside this line shows — so an official never reads
 * two different names for one severity in the same card. SEVERITY_ORDER is
 * what tells "Lowered to Advisory" apart from "Raised to Evacuate Now".
 *
 * A missing or unrecognised `action`, or a detail shape that doesn't match
 * what the trigger that wrote it promises, degrades to a generic sentence
 * that still names the raw action code, rather than rendering blank or
 * throwing — this is a live audit surface, and a blank row reads as "nothing
 * happened here", which is never true of a row that exists at all.
 */
export function describeAction(action: OfficialAction, lang: LanguageCode): string {
  const detail = action.detail ?? {};

  switch (action.action) {
    case "alert.set":
      return describeAlertSet(detail, lang);
    case "alert.cleared":
      return t({ en: "Alert cleared", fil: "Naalis ang alerto" }, lang);
    case "centre.status":
      return describeCentreStatus(detail, lang);
    case "centre.occupancy":
      return describeCentreOccupancy(detail, lang);
    case "pin.removed":
      return describePinRemoved(detail, lang);
    case "pin.restored":
      return t({ en: "Pin restored", fil: "Naibalik ang pin" }, lang);
    case "official.appointed":
      return describeOfficialAppointed(detail, lang);
    case "official.removed":
      return describeOfficialRemoved(detail, lang);
    default:
      return t(
        { en: `Action recorded: ${action.action}`, fil: `Aksyong naitala: ${action.action}` },
        lang
      );
  }
}

function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITY_ORDER as string[]).includes(value);
}

function describeAlertSet(detail: Record<string, unknown>, lang: LanguageCode): string {
  const to = detail.to;
  if (!isSeverity(to)) {
    // Unreachable from the trigger that writes alert.set (`to` is always the
    // inserted row's severity), but a row is a row: degrade rather than crash.
    return t({ en: "Alert set", fil: "Naitakda ang alerto" }, lang);
  }
  const toWord = t(SEVERITY_LABEL[to], lang);
  const from = detail.from;

  if (from === null || from === undefined) {
    return t({ en: `Set to ${toWord}`, fil: `Itinakda sa ${toWord}` }, lang);
  }
  if (!isSeverity(from)) {
    return t({ en: `Set to ${toWord}`, fil: `Itinakda sa ${toWord}` }, lang);
  }

  const fromIndex = SEVERITY_ORDER.indexOf(from);
  const toIndex = SEVERITY_ORDER.indexOf(to);
  if (toIndex < fromIndex) return t({ en: `Lowered to ${toWord}`, fil: `Ibinaba sa ${toWord}` }, lang);
  if (toIndex > fromIndex) return t({ en: `Raised to ${toWord}`, fil: `Itinaas sa ${toWord}` }, lang);
  return t({ en: `Confirmed ${toWord}`, fil: `Kinumpirma ang ${toWord}` }, lang);
}

function describeCentreStatus(detail: Record<string, unknown>, lang: LanguageCode): string {
  const to = detail.to;
  const label = typeof to === "string" && to in CENTER_STATUS_LABEL
    ? CENTER_STATUS_LABEL[to as keyof typeof CENTER_STATUS_LABEL]
    : undefined;
  if (!label) {
    return t({ en: "Evacuation centre status changed", fil: "Nagbago ang katayuan ng evacuation center" }, lang);
  }
  return t(
    { en: `Evacuation centre: ${label.en}`, fil: `Evacuation center: ${label.fil}` },
    lang
  );
}

function describeCentreOccupancy(detail: Record<string, unknown>, lang: LanguageCode): string {
  const to = detail.to;
  if (to === null || to === undefined) {
    return t({ en: "Headcount cleared", fil: "Nalinis ang bilang" }, lang);
  }
  return t({ en: `Headcount: ${to}`, fil: `Bilang: ${to}` }, lang);
}

function describePinRemoved(detail: Record<string, unknown>, lang: LanguageCode): string {
  if (detail.reason === "net_score") {
    return t(
      { en: "Pin removed automatically (net score)", fil: "Awtomatikong inalis ang pin (net score)" },
      lang
    );
  }
  return t({ en: "Pin removed", fil: "Inalis ang pin" }, lang);
}

function describeOfficialAppointed(detail: Record<string, unknown>, lang: LanguageCode): string {
  const displayName = typeof detail.display_name === "string" ? detail.display_name : "?";
  const areaName = typeof detail.area_name === "string" ? detail.area_name : "?";
  return t(
    {
      en: `Appointed ${displayName} for ${areaName}`,
      fil: `Itinalaga si ${displayName} para sa ${areaName}`,
    },
    lang
  );
}

function describeOfficialRemoved(detail: Record<string, unknown>, lang: LanguageCode): string {
  const displayName = typeof detail.display_name === "string" ? detail.display_name : "?";
  return t({ en: `Removed ${displayName}`, fil: `Inalis si ${displayName}` }, lang);
}

const SYSTEM_OWNER = "System owner";
const NOT_AN_OFFICIAL = "Not an official";
const AUTOMATIC_PREFIX = "Automatic — ";

const FIXED_ACTOR: Record<string, LocalizedText> = {
  [SYSTEM_OWNER]: { en: "System owner", fil: "May-ari ng sistema" },
  [NOT_AN_OFFICIAL]: { en: "Not an official", fil: "Hindi opisyal" },
};

/** What follows "Automatic — " in a stored actor name: "net score", or an alert source. */
const AUTOMATIC_CAUSE: Record<string, LocalizedText> = {
  "net score": { en: "net score", fil: "net score" },
  auto_crowdsourced: { en: "community reports", fil: "mga ulat ng komunidad" },
  predicted: { en: "prediction", fil: "prediksyon" },
  cascade: { en: "upstream alert", fil: "babala mula sa itaas" },
};

/**
 * The actor of an official_actions entry, in the requested language (M2).
 * The database triggers write a fixed set of English names for actors that
 * are not a person ("System owner", "Not an official", "Automatic — net
 * score", "Automatic — <alert source>"); those are translated here for
 * display only, and the stored value is never changed. An official's own
 * display name is shown exactly as stored. An automatic cause this module
 * does not know keeps its raw text, so a new source is never hidden.
 */
export function describeActor(actorName: string, lang: LanguageCode): string {
  const fixed = FIXED_ACTOR[actorName];
  if (fixed) return t(fixed, lang);
  if (actorName.startsWith(AUTOMATIC_PREFIX)) {
    const cause = actorName.slice(AUTOMATIC_PREFIX.length);
    const causeLabel = AUTOMATIC_CAUSE[cause];
    const causeText = causeLabel ? t(causeLabel, lang) : cause;
    return t({ en: `Automatic — ${causeText}`, fil: `Awtomatiko — ${causeText}` }, lang);
  }
  return actorName;
}

/**
 * The Manage zone page's last-change line: what changed, who did it, when.
 * English reads "Lowered to Advisory by Juan Dela Cruz, 2:14 PM". Filipino
 * puts the actor in parentheses rather than a connector word, because the
 * natural one ("ni") is only correct before a person's name and several
 * actors here are not people ("May-ari ng sistema", "Awtomatiko — …").
 */
export function describeLastChange(action: OfficialAction, lang: LanguageCode, now: Date = new Date()): string {
  const what = describeAction(action, lang);
  const who = describeActor(action.actorName, lang);
  const when = formatActionTime(action.occurredAt, lang, now);
  return t({ en: `${what} by ${who}, ${when}`, fil: `${what} (${who}), ${when}` }, lang);
}

const LOCALE: Record<LanguageCode, string> = { en: "en-PH", fil: "fil-PH" };

/**
 * When an action happened, for the history list and the last-change line
 * (I6). Today's entries stay time-only; anything earlier carries its date,
 * because on an indefinitely retained accountability record "2:14 PM" alone
 * cannot tell tonight from last week. The year appears only when it is not
 * this year. "Today" is the device's local day, the same clock the time
 * itself is rendered in.
 */
export function formatActionTime(occurredAt: string, lang: LanguageCode, now: Date = new Date()): string {
  const at = new Date(occurredAt);
  const sameDay =
    at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  if (sameDay) return at.toLocaleTimeString(LOCALE[lang]);
  return at.toLocaleString(LOCALE[lang], {
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
