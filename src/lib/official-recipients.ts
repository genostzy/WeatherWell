import type { MessageDirection, MessageKind } from "./official-messages";

/** An appointed official: a 7-digit area is a town, a 10-digit one a barangay. */
export interface OfficialArea {
  id: string;
  areaCode: string;
}

const isBarangay = (code: string) => code.length === 10;

/**
 * A barangay's update goes to its town's official; the town's goes to every
 * barangay official in it; a heads-up goes to the downstream barangay's
 * officials and its town's.
 */
export function messageRecipients(
  msg: { direction: MessageDirection; townCode: string; barangayCode?: string },
  officials: OfficialArea[]
): string[] {
  return officials
    .filter((o) =>
      msg.direction === "up"
        ? o.areaCode === msg.townCode
        : msg.direction === "heads_up"
          ? o.areaCode === msg.barangayCode || o.areaCode === msg.townCode
          : isBarangay(o.areaCode) && o.areaCode.startsWith(msg.townCode)
    )
    .map((o) => o.id);
}

/** An automatic advisory needs a decision from the barangay's own official, and its town's should know. */
export function advisoryRecipients(barangayCode: string, officials: OfficialArea[]): string[] {
  return officials.filter((o) => o.areaCode === barangayCode || o.areaCode === barangayCode.slice(0, 7)).map((o) => o.id);
}

const KIND_TITLE: Record<MessageKind, string> = {
  centre_full: "Our centre is full",
  need_help: "We need help",
  all_clear: "All clear here",
  update: "Update",
  upstream_alert: "Upstream alert",
};

/** Officials' notifications are short and in English, like the rest of their tools' push text. */
export function messageNotification(
  msg: { direction: MessageDirection; kind: MessageKind; body: string; senderName: string },
  barangayName: string | null
): { title: string; body: string } {
  if (msg.direction === "heads_up") {
    return {
      title: `Upstream alert for ${barangayName ?? "your barangay"}`,
      body: `${msg.body.trim()} Water may reach you. Check your barangay. — ${msg.senderName}`,
    };
  }
  const title = msg.direction === "down" ? "Update from the town" : `${barangayName ?? "A barangay"}: ${KIND_TITLE[msg.kind]}`;
  const text = msg.body.trim() || KIND_TITLE[msg.kind];
  return { title, body: `${text} — ${msg.senderName}` };
}
