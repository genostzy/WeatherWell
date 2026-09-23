"use server";

import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "./action-result";

async function callerId(
  supabase: Awaited<ReturnType<typeof createSupabaseUserClient>>
): Promise<string | undefined> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub;
}

export interface AppointOfficialInput {
  email: string;
  /** A barangay ("Barangay X, Town"), a municipality name, or a raw PSGC code — same free-text format private.appoint_official already parses. */
  area: string;
  displayName: string;
}

/**
 * An admin appointing someone as an official. This is a thin wrapper —
 * every rule (area parsing, email-confirmed check, ambiguous-name refusal)
 * lives in public.admin_appoint_official / private.appoint_official
 * (see the migration in Task 1); the database is the one place that rejects
 * a non-admin caller, exactly like setZoneAlert's pattern for operators.
 * No queue: an admin appointing someone is a decision made at a desk with a
 * working connection, not an event that must survive a dropped signal.
 */
export async function appointOfficial(input: AppointOfficialInput): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const userId = await callerId(supabase);
  if (!userId) {
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  const { error } = await supabase.rpc("admin_appoint_official", {
    p_email: input.email,
    p_area: input.area,
    p_display_name: input.displayName,
  });

  if (!error) return { ok: true };
  return { ok: false, permanent: true, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
}
