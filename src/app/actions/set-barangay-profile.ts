"use server";

import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { HazardLevel } from "@/lib/hazards";
import type { ProfileOverlayRow } from "@/lib/reference-data/types";
import type { ActionResult } from "./action-result";

export interface SetBarangayProfileInput {
  zoneId: string;
  flood: HazardLevel;
  landslide: HazardLevel;
  stormSurge: HazardLevel;
  downstreamZoneId: string | null;
}

/** What the database saved, for the official's phone to show at once; or why nothing was. */
export type SetBarangayProfileResult = { ok: true; saved: ProfileOverlayRow } | Extract<ActionResult, { ok: false }>;

/**
 * An official saves their barangay's hazard levels and downstream barangay.
 * The database function does every real check: that the caller manages the
 * barangay, the levels, and that the downstream barangay exists, is not this
 * one and is within 20 km.
 */
export async function setBarangayProfile(input: SetBarangayProfileInput): Promise<SetBarangayProfileResult> {
  const supabase = await createSupabaseUserClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  const { data, error } = await supabase.rpc("set_barangay_profile", {
    p_zone_id: input.zoneId,
    p_flood: input.flood,
    p_landslide: input.landslide,
    p_storm_surge: input.stormSurge,
    // The generated type says string; null (no downstream barangay) is what the function takes to clear it.
    p_downstream_zone_id: input.downstreamZoneId as string,
  });
  if (error) return { ok: false, permanent: true, error: error.message };
  return { ok: true, saved: data as unknown as ProfileOverlayRow };
}
