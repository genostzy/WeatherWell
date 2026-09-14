import { SEVERITY_ORDER, type Severity } from "./severity";
import { CENTER_STATUS_LABEL } from "./center-status";
import { t } from "./i18n";
import type { LanguageCode } from "./types";
import type { OfficialAction } from "./official-actions-mapper";

/**
 * One sentence describing an official_actions entry, in the requested
 * language. Severities are rendered by their raw value, capitalized — "Set
 * to Yellow", not "Set to Advisory" (SEVERITY_LABEL's word) — matching the
 * PAGASA rainfall-warning colour names, which this codebase already keeps in
 * English inside Filipino copy (see severity.ts's PAGASA_RAINFALL_WARNING_LABEL
 * and its callers). SEVERITY_ORDER is what actually does the work here: it is
 * how "Lowered to Yellow" is told apart from "Raised to Evacuate".
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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function describeAlertSet(detail: Record<string, unknown>, lang: LanguageCode): string {
  const to = detail.to;
  if (!isSeverity(to)) {
    // Unreachable from the trigger that writes alert.set (`to` is always the
    // inserted row's severity), but a row is a row: degrade rather than crash.
    return t({ en: "Alert set", fil: "Naitakda ang alerto" }, lang);
  }
  const toWord = capitalize(to);
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
