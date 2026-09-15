"use server";

import type { CenterStatus } from "@/lib/types";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "./action-result";

const CENTER_STATUSES: CenterStatus[] = ["space_available", "limited", "full"];

/**
 * getClaims, never getSession: it verifies the JWT signature against the
 * project's published keys. getSession does not revalidate and a spoofed
 * cookie would pass it.
 */
async function callerId(
  supabase: Awaited<ReturnType<typeof createSupabaseUserClient>>
): Promise<string | undefined> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub;
}

/**
 * Zero rows and no error is what an UPDATE refused by RLS looks like from
 * postgrest — there is no error to inspect, only an empty result.
 * `centers_update_in_area` is the only policy that touches this table's
 * UPDATE, and it admits only an official for the centre's area, so a resident
 * (or an official for another area) calling either action below
 * would otherwise be told it worked while nothing changed.
 */
function refused(): ActionResult {
  return { ok: false, permanent: true, error: "That center is not yours to update, or does not exist." };
}

/**
 * Why neither action here goes through the outbox: see the comment atop
 * set-zone-alert.ts, which is the same reasoning for the same class of
 * caller. In short — every queued write elsewhere is a resident's, made on a
 * phone that may lose signal, and must survive that. These are an
 * operator's, made at a desk, and each is a decision about the centre's
 * *current* state, not an event to record. A queued capacity update replayed
 * later could overwrite a newer headcount with a stale one; there is no safe
 * way to replay "this was the count forty minutes ago" onto "this is the
 * count now". So both actions call the database directly and hand the
 * operator a failure to act on, rather than pretending a retry queue could
 * make a stale decision current.
 */

/** An operator marking a zone's evacuation center status by hand. */
export async function setCenterStatus(input: { zoneId: string; status: CenterStatus }): Promise<ActionResult> {
  if (!CENTER_STATUSES.includes(input.status)) {
    return { ok: false, permanent: true, error: `Unknown center status: ${input.status}` };
  }

  const supabase = await createSupabaseUserClient();
  // Permanent, not transient: there is no queue to retry into here (see the
  // reasoning above), so a missing session is reported now rather than
  // deferred to a retry that will never come.
  if (!(await callerId(supabase))) {
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  const { data, error } = await supabase
    .from("evacuation_centers")
    .update({ status: input.status })
    .eq("zone_id", input.zoneId)
    .select("zone_id");

  if (error) return { ok: false, permanent: true, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
  if (!data || data.length === 0) return refused();
  return { ok: true };
}

/**
 * An operator entering a zone's evacuation center headcount — PRD Gap B.
 * `null` clears the tracked headcount, which falls the displayed status back
 * to the manual `status` column (see `resolveEffectiveCenterStatus` in
 * center-status.ts); this action only ever writes `current_occupancy`
 * itself, never derives or writes `status` as a side effect.
 */
export async function setCenterOccupancy(input: { zoneId: string; occupancy: number | null }): Promise<ActionResult> {
  if (input.occupancy !== null && (!Number.isInteger(input.occupancy) || input.occupancy < 0)) {
    return { ok: false, permanent: true, error: `Occupancy must be a non-negative integer or null, got ${input.occupancy}.` };
  }

  const supabase = await createSupabaseUserClient();
  if (!(await callerId(supabase))) {
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  const { data, error } = await supabase
    .from("evacuation_centers")
    .update({ current_occupancy: input.occupancy })
    .eq("zone_id", input.zoneId)
    .select("zone_id");

  if (error) return { ok: false, permanent: true, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
  if (!data || data.length === 0) return refused();
  return { ok: true };
}
