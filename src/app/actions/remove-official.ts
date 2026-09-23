"use server";

import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "./action-result";

async function callerId(
  supabase: Awaited<ReturnType<typeof createSupabaseUserClient>>
): Promise<string | undefined> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub;
}

export interface RemoveOfficialInput {
  email: string;
}

/** An admin removing someone's official status. Same shape as appointOfficial — see its own doc comment. */
export async function removeOfficial(input: RemoveOfficialInput): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const userId = await callerId(supabase);
  if (!userId) {
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  const { error } = await supabase.rpc("admin_remove_official", { p_email: input.email });

  if (!error) return { ok: true };
  return { ok: false, permanent: true, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
}
