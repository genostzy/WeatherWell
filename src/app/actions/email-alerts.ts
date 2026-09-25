"use server";

import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "./action-result";

const NO_SESSION: ActionResult = { ok: false, permanent: true, error: "No session — sign in and try again." };

/**
 * Turns on email alerts for the barangay this phone follows. The database
 * accepts only an account signed in with Google, whose address Google has
 * checked.
 */
export async function subscribeEmailAlerts(zoneId: string | null): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NO_SESSION;

  // The generated Args type renders p_zone_id as string, although the
  // function takes null ("no barangay yet"); narrowed here only.
  const { error } = await supabase.rpc("subscribe_email_alerts", { p_zone_id: zoneId as string });
  if (!error) return { ok: true };
  return { ok: false, permanent: true, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
}

/** Turns email alerts off. Row Level Security limits the delete to the caller's own row. */
export async function unsubscribeEmailAlerts(): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NO_SESSION;

  const { error } = await supabase.from("email_alert_subscriptions").delete().eq("user_id", userId);
  if (!error) return { ok: true };
  return { ok: false, permanent: true, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
}
