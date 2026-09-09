import type { PinStatusTag, PinRemovalReason } from "./community-pin";

/**
 * The pure row → pin mapping, split out of community-pins.ts for exactly the
 * reason alerts-mapper.ts documents: community-pins.ts is `"use client"`, and
 * Next's RSC bundler turns every export of a client module into a client
 * reference for server callers — so /api/pins's route handler, which runs on
 * the server, would get a 500 calling anything imported from there.
 *
 * This module must stay free of `"use client"`, must not be merged back into
 * community-pins.ts, and community-pins.ts must not re-export from it. Any of
 * those puts `toPins` back behind a client boundary. The separation is
 * load-bearing, not incidental file-splitting.
 */
export interface PinRow {
  id: string;
  zone_id: string;
  status_tag: string;
  caption: string;
  lat: number;
  lng: number;
  author_id: string;
  created_at: string;
  removed: boolean;
  removed_reason: string | null;
}

export interface PinTally {
  pin_id: string;
  direction: number;
  voter_id: string;
}

export interface MappedPin {
  id: string;
  zoneId: string;
  statusTag: PinStatusTag;
  caption: string;
  lat: number;
  lng: number;
  upvotes: number;
  downvotes: number;
  /** The caller's own vote, if they have one. Replaces the local votes store. */
  ownVote?: 1 | -1;
  createdAt: string;
  authorId: string;
  removed: boolean;
  /**
   * Undefined means removed by the author themselves — see PinRemovalReason.
   * The moderation panel needs this to tell a brigading removal apart from an
   * operator's own decision, which is the difference between a pin worth
   * restoring and one already judged.
   */
  removedReason?: PinRemovalReason;
}

/**
 * Tallies are derived here rather than stored, because a denormalised counter
 * beside a pin_votes table is two sources of truth for one number and they
 * will disagree the first time a write is retried.
 */
export function toPins(rows: PinRow[], votes: PinTally[], callerId: string | undefined): MappedPin[] {
  const byPin = new Map<string, PinTally[]>();
  for (const vote of votes) {
    const list = byPin.get(vote.pin_id);
    if (list) list.push(vote);
    else byPin.set(vote.pin_id, [vote]);
  }

  return rows.map((row) => {
    const cast = byPin.get(row.id) ?? [];
    const own = callerId ? cast.find((vote) => vote.voter_id === callerId) : undefined;
    return {
      id: row.id,
      zoneId: row.zone_id,
      // `status_tag` and `removed_reason` are CHECK-constrained text columns
      // rather than Postgres enums, so the generated types render them as
      // `string`. These narrow exactly those two fields to the unions the
      // CHECK constraints already guarantee at runtime — the same per-field
      // pattern /api/reports uses, never a whole-result cast.
      statusTag: row.status_tag as PinStatusTag,
      caption: row.caption,
      lat: row.lat,
      lng: row.lng,
      upvotes: cast.filter((vote) => vote.direction === 1).length,
      downvotes: cast.filter((vote) => vote.direction === -1).length,
      ownVote: own ? (own.direction === 1 ? 1 : -1) : undefined,
      createdAt: row.created_at,
      authorId: row.author_id,
      removed: row.removed,
      removedReason: (row.removed_reason as PinRemovalReason | null) ?? undefined,
    };
  });
}
