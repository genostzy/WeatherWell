"use server";

import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "./action-result";

const NO_SESSION: ActionResult = { ok: false, permanent: true, error: "No session — sign in and try again." };

/**
 * A municipal official appointing a barangay official in their own town.
 * town_appoint_barangay_official holds every rule: the caller is a municipal
 * official, the barangay is in their town, and the account is not already
 * someone else's official.
 */
export async function appointBarangayOfficial(input: { email: string; zoneId: string; displayName: string }): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NO_SESSION;
  const { error } = await supabase.rpc("town_appoint_barangay_official", {
    p_email: input.email,
    p_zone_id: input.zoneId,
    p_display_name: input.displayName,
  });
  if (!error) return { ok: true };
  return { ok: false, permanent: true, error: error.message };
}

/** A municipal official removing one of their town's barangay officials. */
export async function removeBarangayOfficial(userId: string): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NO_SESSION;
  const { error } = await supabase.rpc("town_remove_barangay_official", { p_user_id: userId });
  if (!error) return { ok: true };
  return { ok: false, permanent: true, error: error.message };
}
