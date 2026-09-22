import type { LanguageCode } from "@/lib/types";

/**
 * An alert that carries everything needed to render it, so a forwarded copy
 * opens without the server being contacted at all.
 *
 * This is what makes the share chain a real delivery channel rather than a
 * link back to an origin the resident may not be able to reach. The encoded
 * payload rides in a URL fragment, which browsers never send upstream — so
 * a recipient whose app is already cached by the service worker gets the
 * full alert while completely offline.
 */
export interface SharedAlert {
  /** Bumped when the shape changes; an unknown version decodes to null. */
  v: 1;
  zoneId: string;
  zoneName: string;
  /** The localised human label ("Evacuate Now" / "Lumikas Na") — what renders as text. */
  severity: string;
  /**
   * The severity enum alongside the label above, so /a can colour the badge
   * the same way the app's own alert surfaces do. Optional: an unrecognised
   * or absent key renders the label as plain text rather than claiming a
   * colour it cannot back up.
   */
  severityKey?: "yellow" | "orange" | "red" | "evacuate";
  /** ISO 8601. */
  issuedAt: string;
  /** Already localised by the sharer — the recipient may not share a language setting. */
  message: string;
  centerName?: string;
  hotline?: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function encodeAlert(alert: SharedAlert): string {
  // TextEncoder, never btoa(JSON.stringify(...)) directly: btoa throws on
  // any character outside Latin-1, which Filipino copy and Spanish-derived
  // barangay names contain constantly.
  return toBase64Url(new TextEncoder().encode(JSON.stringify(alert)));
}

function isSharedAlert(value: unknown): value is SharedAlert {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.v === 1 &&
    typeof candidate.zoneId === "string" &&
    typeof candidate.zoneName === "string" &&
    typeof candidate.severity === "string" &&
    typeof candidate.issuedAt === "string" &&
    typeof candidate.message === "string"
  );
}

/**
 * Never throws. A payload clipped by a carrier, mangled by a messaging app,
 * or written by a newer version of the app returns null, and the caller
 * shows a "this link is damaged" message — which is recoverable, where a
 * thrown error on a shared emergency alert is not.
 */
export function decodeAlert(encoded: string): SharedAlert | null {
  if (encoded.length === 0) return null;
  const bytes = fromBase64Url(encoded);
  if (!bytes) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isSharedAlert(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const HEADING: Record<LanguageCode, string> = {
  en: "WEATHERWELL ALERT",
  fil: "ALERTO NG WEATHERWELL",
};
const EVACUATE_TO: Record<LanguageCode, string> = { en: "Evacuate to", fil: "Lumikas sa" };
const HOTLINE: Record<LanguageCode, string> = { en: "Hotline", fil: "Hotline" };

/**
 * The human-readable alert comes FIRST and the link last, deliberately: if a
 * carrier clips the message, what survives is the part a person with no app
 * and no signal can still act on.
 */
export function buildShareText(alert: SharedAlert, origin: string, lang: LanguageCode): string {
  const time = new Date(alert.issuedAt).toLocaleTimeString(lang === "fil" ? "fil-PH" : "en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines = [
    `${HEADING[lang]} - ${alert.zoneName} - ${alert.severity.toUpperCase()} - ${time}`,
    alert.message,
  ];
  if (alert.centerName) lines.push(`${EVACUATE_TO[lang]}: ${alert.centerName}`);
  if (alert.hotline) lines.push(`${HOTLINE[lang]}: ${alert.hotline}`);
  lines.push(`${origin}/a#${encodeAlert(alert)}`);

  return lines.join("\n");
}
