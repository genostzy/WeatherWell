export type MessageKind = "centre_full" | "need_help" | "all_clear" | "update";
export type MessageDirection = "up" | "down";

/** An update between a town and its barangays (official_messages). */
export interface OfficialMessage {
  id: string;
  townCode: string;
  /** The sending barangay's zone, for an update going up; null from the town. */
  zoneId: string | null;
  direction: MessageDirection;
  kind: MessageKind;
  body: string;
  senderName: string;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
}

export interface OfficialMessageRow {
  id: string;
  town_code: string;
  zone_id: string | null;
  direction: string;
  kind: string;
  body: string;
  sender_name: string;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by_name: string | null;
}

/** direction and kind are CHECK-constrained text columns; narrowed here, per field. */
export function toOfficialMessage(row: OfficialMessageRow): OfficialMessage {
  return {
    id: row.id,
    townCode: row.town_code,
    zoneId: row.zone_id,
    direction: row.direction as MessageDirection,
    kind: row.kind as MessageKind,
    body: row.body,
    senderName: row.sender_name,
    createdAt: row.created_at,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedByName: row.acknowledged_by_name,
  };
}
