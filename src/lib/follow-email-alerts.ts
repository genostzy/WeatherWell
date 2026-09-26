import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Email alerts follow my barangay, as a push subscription does: when a
 * signed-in resident has them on for another barangay, they move to this
 * one. Nothing happens for a resident without email alerts (or without an
 * account), and a failure leaves them where they were.
 */
export async function followEmailAlerts(zoneId: string): Promise<void> {
  try {
    const { data } = await getBrowserClient().from("email_alert_subscriptions").select("zone_id").maybeSingle();
    if (!data || data.zone_id === zoneId) return;
    const { subscribeEmailAlerts } = await import("@/app/actions/email-alerts");
    await subscribeEmailAlerts(zoneId);
  } catch {
    // Offline or signed out: the Settings card moves them on its next visit.
  }
}
