import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { emailConfigured, EMAIL_NOT_CONFIGURED, sendNoticeEmails, type EmailNotice, type EmailResult } from "./send-email";

const service = () =>
  createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** Everyone who turned email alerts on: for a barangay, or among the given accounts. */
async function emailTo(args: { p_zone_id?: string; p_user_ids?: string[] }, notice: EmailNotice): Promise<EmailResult> {
  if (!emailConfigured()) return { ok: false, error: EMAIL_NOT_CONFIGURED };
  const { data, error } = await service().rpc("email_alert_recipients", args);
  if (error) return { ok: false, error: error.message };
  return sendNoticeEmails(
    (data ?? []).map((row) => ({ email: row.email, unsubscribeToken: row.unsubscribe_token })),
    notice
  );
}

/** Residents following a barangay who turned email alerts on. */
export function emailZone(zoneId: string, notice: EmailNotice): Promise<EmailResult> {
  return emailTo({ p_zone_id: zoneId }, notice);
}

/** The given accounts (officials), each only if they turned email alerts on. */
export function emailUsers(userIds: string[], notice: EmailNotice): Promise<EmailResult> {
  if (userIds.length === 0) return Promise.resolve({ ok: true, sent: 0, failed: 0 });
  return emailTo({ p_user_ids: userIds }, notice);
}
