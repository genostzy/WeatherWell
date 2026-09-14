import { isInArea } from "./auth/official";

/**
 * The pure row -> OfficialAction mapping, split out of any "use client"
 * module for the same reason alerts-mapper.ts documents: /api/official-actions's
 * route handler runs on the server and needs to call toOfficialActions
 * directly, without going through a client-boundary re-export. This file
 * must stay free of "use client", and it must not be re-exported from a
 * "use client" module either.
 *
 * `actor_id` is deliberately absent from OfficialActionRow. The route that
 * produces these rows selects only the other eight columns from
 * official_actions — history shows a person's NAME and AREA, never their
 * user id. If a caller needs actor_id, that is a sign the route (or this
 * type) is being widened in the wrong direction.
 */
export interface OfficialActionRow {
  id: number;
  occurred_at: string;
  actor_name: string;
  actor_area: string | null;
  action: string;
  zone_id: string | null;
  target_id: string | null;
  detail: Record<string, unknown>;
}

export interface OfficialAction {
  id: number;
  occurredAt: string;
  actorName: string;
  actorArea: string | null;
  action: string;
  zoneId: string | null;
  targetId: string | null;
  detail: Record<string, unknown>;
}

export function toOfficialActions(rows: OfficialActionRow[]): OfficialAction[] {
  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    actorName: row.actor_name,
    actorArea: row.actor_area,
    action: row.action,
    zoneId: row.zone_id,
    targetId: row.target_id,
    detail: row.detail,
  }));
}

/**
 * Keeps only entries whose zone falls inside `areaCode` (the same prefix
 * match `isInArea` uses for controls elsewhere). Zone-less entries —
 * official.appointed / official.removed, which carry no zone_id — are
 * dropped: they belong under the "All areas" view only, never "My area".
 */
export function filterToArea(
  actions: OfficialAction[],
  zones: { id: string; psgcBarangayCode: string }[],
  areaCode: string
): OfficialAction[] {
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  return actions.filter((action) => {
    if (!action.zoneId) return false;
    const zone = zoneById.get(action.zoneId);
    return zone !== undefined && isInArea(zone.psgcBarangayCode, areaCode);
  });
}
