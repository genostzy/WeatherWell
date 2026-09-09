import { NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { toPins, type PinRow, type PinTally } from "@/lib/pins-mapper";

/**
 * Every pin including removed ones, with vote tallies derived from pin_votes
 * and the caller's own vote direction.
 *
 * Removed pins are returned rather than filtered here because the admin
 * moderation panel must be able to restore one, and a pin it cannot see is a
 * pin it cannot restore. The public map filters them client-side, which is
 * what useCommunityPins already does.
 *
 * The USER client, not the public one — unlike /api/reports. Pins themselves
 * are world-readable, but `ownVote` is per-caller, and reading it needs the
 * caller's session. An unauthenticated visitor still gets every pin and every
 * tally; they simply have no vote of their own to report.
 *
 * That per-caller field sits badly with a shared cache, and it is still on
 * sw.js's public allowlist anyway. The trade-off, stated plainly: the
 * sensitive half of a vote is "who voted", and that is not sensitive here —
 * pin_votes carries `select using (true)`, so voter_id is world-readable by
 * design and the tallies are the whole point of the feature. What the shared
 * cache can get wrong is only "did *I* vote", and being wrong about that costs
 * a resident one refused duplicate vote (the server's unique key is the real
 * gate), not a disclosure. Weighed against a resident during a flood seeing
 * every neighbour's pin from cache with no network, that is the right way
 * round. If ownVote ever gates something that matters, this route stops being
 * cacheable and sw.js must drop it from PUBLIC_API_PATHS in the same change.
 */
export async function GET() {
  const supabase = await createSupabaseUserClient();

  const { data: claims } = await supabase.auth.getClaims();
  const callerId = claims?.claims?.sub;

  const [pins, votes] = await Promise.all([
    supabase
      .from("community_pins")
      .select("id, zone_id, status_tag, caption, lat, lng, author_id, created_at, removed, removed_reason")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("pin_votes").select("pin_id, direction, voter_id").limit(5000),
  ]);

  // Never 200 with an empty list on failure — "no pins" reads as "nobody has
  // reported anything" to whoever is looking at a flooded barangay.
  if (pins.error) return NextResponse.json({ error: pins.error.message }, { status: 502 });
  if (votes.error) return NextResponse.json({ error: votes.error.message }, { status: 502 });

  return NextResponse.json(toPins(pins.data as PinRow[], votes.data as PinTally[], callerId));
}
