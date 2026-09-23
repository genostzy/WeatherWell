"use server";

import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "./action-result";

export interface ConfirmEvacuationCenterInput {
  zoneId: string;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
}

/**
 * An official confirms a site (usually an OpenStreetMap suggestion) as their
 * barangay's evacuation centre (idea 10). The database function does the
 * real checks: that the caller manages the barangay, the site is within
 * 5 km, the name and capacity are sane.
 */
export async function confirmEvacuationCenter(input: ConfirmEvacuationCenterInput): Promise<ActionResult> {
  if (!Number.isInteger(input.capacity)) {
    return { ok: false, permanent: true, error: "Capacity must be a whole number." };
  }

  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  const { error } = await supabase.rpc("confirm_evacuation_center", {
    p_zone_id: input.zoneId,
    p_name: input.name,
    p_lat: input.lat,
    p_lng: input.lng,
    p_capacity: input.capacity,
  });
  if (!error) return { ok: true };
  return { ok: false, permanent: true, error: error.message };
}
