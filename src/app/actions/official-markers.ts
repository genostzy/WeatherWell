"use server";

import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "./action-result";
import { OFFICIAL_MARKER_TYPES, type OfficialMarker, type OfficialMarkerType } from "@/lib/official-markers";

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
 * Zero rows and no error is what a write refused by RLS looks like from
 * postgrest — there is no error to inspect, only an empty result. The
 * official_markers_delete policy admits only an appointed official
 * (private.is_operator()), so a resident calling deleteOfficialMarker would
 * otherwise be told it worked while nothing changed.
 */
function refused(): ActionResult {
  return { ok: false, permanent: true, error: "Not an appointed official, or that marker no longer exists." };
}

export interface CreateOfficialMarkerInput {
  lat: number;
  lng: number;
  type: OfficialMarkerType;
  caption: string;
}

/**
 * An official placing a hazard marker on the operations map.
 *
 * **Does not go through the outbox, deliberately** — same reasoning as
 * set-zone-alert.ts and set-center.ts: this is an official's write, made at
 * a desk with a working connection, not a resident's write on a phone that
 * may lose signal. There is nothing here a retry queue would make safer.
 *
 * `placed_by` is never taken from the client: it is always the caller's own
 * id, both here and as a second guard in the table's own INSERT policy
 * (`with check ((select auth.uid()) = placed_by)`), so a marker can never be
 * misattributed to someone else even if this function's own check were
 * ever removed.
 */
export async function createOfficialMarker(
  input: CreateOfficialMarkerInput
): Promise<ActionResult & { marker?: OfficialMarker }> {
  if (!OFFICIAL_MARKER_TYPES.includes(input.type)) {
    return { ok: false, permanent: true, error: `Unknown marker type: ${input.type}` };
  }
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    return { ok: false, permanent: true, error: "Marker position is not a valid coordinate." };
  }

  const supabase = await createSupabaseUserClient();
  const userId = await callerId(supabase);
  if (!userId) {
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  const { data, error } = await supabase
    .from("official_markers")
    .insert({
      lat: input.lat,
      lng: input.lng,
      type: input.type,
      caption: input.caption,
      placed_by: userId,
    })
    .select("id, lat, lng, type, caption, placed_by, placed_at")
    .single();

  if (error || !data) {
    return { ok: false, permanent: true, error: error?.message ?? `Database error ${error?.code ?? "(no code)"}` };
  }

  return {
    ok: true,
    marker: {
      id: data.id,
      lat: data.lat,
      lng: data.lng,
      type: data.type as OfficialMarkerType,
      caption: data.caption,
      placedBy: data.placed_by,
      placedAt: data.placed_at,
    },
  };
}

/** An official removing a hazard marker — any official may remove any marker (see the migration's own comment). */
export async function deleteOfficialMarker(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  if (!(await callerId(supabase))) {
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  const { data, error } = await supabase
    .from("official_markers")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, permanent: true, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
  if (!data || data.length === 0) return refused();
  return { ok: true };
}
