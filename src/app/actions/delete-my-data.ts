"use server";

import { createClient } from "@supabase/supabase-js";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "./action-result";

const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/**
 * A resident deletes their data (Settings, "Delete my data"). The database
 * does the part that must happen together (delete_my_data: reports
 * anonymised, pins detached, votes, check-ins and recovery attempts gone,
 * officials refused); then the pins' photos are deleted, best effort, since
 * the daily cleanup removes unattached ones anyway; then the account, which
 * takes the profile, alert subscriptions and security answers with it.
 *
 * A failed account delete asks for another try: the database step finds
 * nothing the second time, and an account already gone counts as done.
 */
export async function deleteMyData(): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, permanent: true, error: "No session — sign in and try again." };

  const { data: paths, error } = await supabase.rpc("delete_my_data");
  if (error) return { ok: false, permanent: true, error: error.message };

  const admin = service();
  if (paths && paths.length > 0) {
    const { error: removeError } = await admin.storage.from("pin-photos").remove(paths);
    if (removeError) console.error("deleteMyData: photos left to the daily cleanup", removeError.message);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError && !/not found/i.test(deleteError.message)) {
    return { ok: false, permanent: false, error: deleteError.message };
  }
  return { ok: true };
}
