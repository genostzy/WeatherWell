"use server";

import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { DetailsOverlayRow } from "@/lib/reference-data/types";
import type { ActionResult } from "./action-result";

export interface SetBarangayDetailsInput {
  zoneId: string;
  hotlines: string[];
  instructions: { en: string; fil: string };
}

/** What the database saved, for the official's phone to show at once; or why nothing was. */
export type SetBarangayDetailsResult = { ok: true; saved: DetailsOverlayRow } | Extract<ActionResult, { ok: false }>;

/**
 * An official fills in their barangay's hotlines and evacuation instructions.
 * The database function does every real check: that the caller manages the
 * barangay, and the numbers and instructions (the form applies the same rules
 * first, from src/lib/barangay-details.ts).
 */
export async function setBarangayDetails(input: SetBarangayDetailsInput): Promise<SetBarangayDetailsResult> {
  const supabase = await createSupabaseUserClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  const { data, error } = await supabase.rpc("set_barangay_details", {
    p_zone_id: input.zoneId,
    p_hotlines: input.hotlines,
    p_instructions_en: input.instructions.en,
    p_instructions_fil: input.instructions.fil,
  });
  if (error) return { ok: false, permanent: true, error: error.message };
  return { ok: true, saved: data as unknown as DetailsOverlayRow };
}
