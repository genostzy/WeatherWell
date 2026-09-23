/**
 * Neighbour relay (idea 7): a resident's own short list of people to text
 * when an alert lands — an elderly relative, a neighbour without a
 * smartphone. Kept on this device only, never uploaded, so there is nothing
 * to leak. The text goes out as ordinary SMS from the resident's own phone,
 * which still works when mobile data does not.
 */
export interface RelayContact {
  name: string;
  number: string;
}

export const MAX_RELAY_CONTACTS = 5;
const KEY = "weatherwell.relayContacts";

export function loadRelayContacts(): RelayContact[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is RelayContact => typeof c?.name === "string" && typeof c?.number === "string" && c.number.trim() !== ""
    );
  } catch {
    return [];
  }
}

export function saveRelayContacts(contacts: RelayContact[]): void {
  const kept = contacts.filter((c) => c.number.trim() !== "").slice(0, MAX_RELAY_CONTACTS);
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Private mode or full storage: the list just isn't remembered.
  }
}

/** Android takes comma-separated recipients in the path; iOS needs its own /open form for more than one. */
export function buildRelaySmsHref(numbers: string[], body: string, userAgent: string): string {
  const recipients = numbers.map((n) => n.replace(/[^\d+]/g, "")).join(",");
  const encoded = encodeURIComponent(body);
  return /iPhone|iPad|iPod/.test(userAgent)
    ? `sms:/open?addresses=${recipients}&body=${encoded}`
    : `sms:${recipients}?body=${encoded}`;
}
