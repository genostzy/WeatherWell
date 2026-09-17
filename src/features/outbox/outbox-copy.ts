import { t } from "@/lib/i18n";
import { DEPTH_LABEL, type DepthLevel } from "@/lib/depth";
import type { LanguageCode, LocalizedText, Zone } from "@/lib/types";
import type { OutboxEntry } from "@/lib/outbox/types";

/**
 * Every user-facing string `OutboxBadge` shows, copied verbatim from the
 * design doc, spec section 3 ("The badge"). Nothing here is reworded — a
 * literal `{n}` / `{zone}` / `{depth}` / `{reason}` placeholder is
 * substituted by the functions below, but the surrounding text is exactly
 * what the product owner signed off on.
 *
 * "Sending…" / "Ipinapadala…" is spec'd but deliberately NOT implemented:
 * nothing in this codebase exposes a reactive, per-entry in-flight flag.
 * `src/lib/outbox/drain.ts` has a `draining` boolean and an `inFlight`
 * promise, but both are module-private (never exported), track the WHOLE
 * drain rather than one entry, and are not observable through any hook —
 * there is nothing here for `useOutbox()` (or any other store) to re-render
 * on. Inventing a flag to satisfy this string would mean state that no
 * drain actually reports. Every entry this component can see is therefore
 * described as "Will send when online" while pending, or its stuck reason
 * while stuck — never "Sending…".
 */
const WAITING: LocalizedText = { en: "{n} waiting to send", fil: "{n} naghihintay na maipadala" };
const COULD_NOT_SEND: LocalizedText = { en: "{n} couldn't send", fil: "{n} hindi naipadala" };

const WATER_LEVEL_REPORT: LocalizedText = {
  en: "Water level report — {zone}, {depth}",
  fil: "Ulat ng lalim ng tubig — {zone}, {depth}",
};
const CHECK_IN: LocalizedText = { en: "Check-in — {zone}", fil: "Check-in — {zone}" };
const PIN: LocalizedText = { en: "Pin", fil: "Pin" };
const VOTE_ON_PIN: LocalizedText = { en: "Vote on a pin", fil: "Boto sa pin" };
const PIN_MODERATION: LocalizedText = { en: "Pin moderation", fil: "Pag-moderate ng pin" };

const WILL_SEND_WHEN_ONLINE: LocalizedText = {
  en: "Will send when online",
  fil: "Ipapadala kapag may koneksyon",
};
const COULD_NOT_SEND_REASON: LocalizedText = {
  en: "Couldn't send: {reason}",
  fil: "Hindi naipadala: {reason}",
};

const TOO_OLD_REASON: LocalizedText = {
  en: "Too old to send — report again if it's still flooded.",
  fil: "Masyadong luma para ipadala — mag-ulat muli kung may baha pa.",
};
const GAVE_UP_REASON: LocalizedText = {
  en: "Tried many times without success.",
  fil: "Sinubukan nang maraming beses nang walang tagumpay.",
};

/**
 * Not from the spec table. `stuckReason: "permanent"` (design doc
 * section 2, "a 422 becomes stuck ... with ... the reason text")
 * carries whatever text the server actually sent back in `lastError` — a raw
 * database message, "invalid", "unknown_operation", "pin was never created"
 * (`drain.ts`'s `PIN_NEVER_CREATED`), sometimes only in English. A resident
 * must never see that raw text, in either language, so every `permanent` (or
 * legacy, reason-less) stuck entry reads this one bilingual sentence instead.
 * `lastError` stays on the entry for debugging — this module just stops
 * rendering it.
 *
 * "Could not save — try again." (the admin screens' existing failure copy —
 * see admin-map-canvas.tsx, community-pin-moderation-panel.tsx,
 * evacuation-management-panel.tsx, admin/zone/[zoneId]/page.tsx) does not fit
 * here: it tells the reader retrying the same action will likely work, which
 * is true for the transient save failures those screens show it for, but
 * false for a `permanent` outcome — the same request will be refused again
 * unchanged. Reusing it would be actively misleading, so this uses its own
 * wording instead.
 */
const NOT_ACCEPTED: LocalizedText = { en: "This couldn't be accepted.", fil: "Hindi ito tinanggap." };

export const RETRY_LABEL: LocalizedText = { en: "Retry", fil: "Subukang muli" };
export const DISCARD_LABEL: LocalizedText = { en: "Discard", fil: "Huwag ipadala" };
export const DISCARD_CONFIRM: LocalizedText = {
  en: "Discard this? It won't be sent.",
  fil: "Huwag ipadala? Hindi ito ipapadala.",
};

/** Not from the spec table — the same "Close" every other dialog in this app uses (see homepage-map.tsx's CLOSE_DIALOG). */
export const CLOSE: LocalizedText = { en: "Close", fil: "Isara" };
/** Not from the spec table — the same "Cancel" every other confirm dialog in this app uses (see homepage-map.tsx's CANCEL). */
export const CANCEL: LocalizedText = { en: "Cancel", fil: "Kanselahin" };

export type OutboxBadgeState = "pending" | "stuck";

/** "{n} waiting to send" / "{n} couldn't send", with `{n}` filled in. */
export function badgeLabel(state: OutboxBadgeState, count: number, lang: LanguageCode): string {
  const template = state === "stuck" ? COULD_NOT_SEND : WAITING;
  return t(template, lang).replace("{n}", String(count));
}

function zoneName(zones: Zone[], zoneId: string | undefined): string {
  return zones.find((zone) => zone.id === zoneId)?.name ?? (zoneId ?? "?");
}

/**
 * "Water level report — {zone}, {depth}", "Check-in — {zone}", "Pin", "Vote
 * on a pin" or "Pin moderation", per the entry's operation (spec section 3,
 * "Description"). `createPin`/`editPin`/`deleteOwnPin` all read as "Pin" —
 * the spec gives one label for all three, not three separate ones.
 */
export function entryDescription(entry: OutboxEntry, zones: Zone[], lang: LanguageCode): string {
  switch (entry.operation) {
    case "submitWaterLevelReport": {
      const payload = entry.payload as { zoneId: string; depthLevel: DepthLevel };
      return t(WATER_LEVEL_REPORT, lang)
        .replace("{zone}", zoneName(zones, payload.zoneId))
        .replace("{depth}", t(DEPTH_LABEL[payload.depthLevel], lang));
    }
    case "recordCheckIn": {
      const payload = entry.payload as { zoneId: string };
      return t(CHECK_IN, lang).replace("{zone}", zoneName(zones, payload.zoneId));
    }
    case "voteOnPin":
      return t(VOTE_ON_PIN, lang);
    case "setPinRemoved":
      return t(PIN_MODERATION, lang);
    case "createPin":
    case "editPin":
    case "deleteOwnPin":
    default:
      return t(PIN, lang);
  }
}

/**
 * The stuck reason's own sentence — "Too old to send…", "Tried many
 * times…", or (for "permanent" and any other/missing reason) the bilingual
 * "This couldn't be accepted." `entry.lastError` is never read here — see
 * `NOT_ACCEPTED`'s comment for why raw server text must not reach this UI.
 */
function stuckReasonText(entry: OutboxEntry, lang: LanguageCode): string {
  if (entry.stuckReason === "too_old") return t(TOO_OLD_REASON, lang);
  if (entry.stuckReason === "gave_up") return t(GAVE_UP_REASON, lang);
  return t(NOT_ACCEPTED, lang);
}

/** "Will send when online", or "Couldn't send: {reason}" for a stuck entry. */
export function entryStatusText(entry: OutboxEntry, lang: LanguageCode): string {
  if (entry.status !== "stuck") return t(WILL_SEND_WHEN_ONLINE, lang);
  return t(COULD_NOT_SEND_REASON, lang).replace("{reason}", stuckReasonText(entry, lang));
}
