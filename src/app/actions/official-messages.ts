"use server";

import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { MessageKind } from "@/lib/official-messages";
import { notifyOfficialsOfMessage } from "@/lib/notify-officials";
import type { ActionResult } from "./action-result";

const NO_SESSION: ActionResult = { ok: false, permanent: true, error: "No session — sign in and try again." };

/**
 * A barangay official's update to their town, or a municipal official's to
 * every barangay in it: send_official_message works out which from the
 * caller's own area, so the page cannot pick a town it is not in.
 */
export async function sendOfficialMessage(input: { kind: MessageKind; body: string }): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NO_SESSION;
  const { data: id, error } = await supabase.rpc("send_official_message", { p_kind: input.kind, p_body: input.body });
  if (!error) {
    // To the recipients' phones as well as their dashboards; never fails the send.
    if (id) await notifyOfficialsOfMessage(id);
    return { ok: true };
  }
  return { ok: false, permanent: true, error: error.message };
}

/** A municipal official marks a barangay's update as seen. */
export async function acknowledgeOfficialMessage(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NO_SESSION;
  const { error } = await supabase.rpc("acknowledge_official_message", { p_id: id });
  if (!error) return { ok: true };
  return { ok: false, permanent: true, error: error.message };
}
