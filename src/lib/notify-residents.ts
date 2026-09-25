import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sendZonePush } from "@/lib/send-zone-push";
import { emailZone } from "@/lib/email-alerts";
import { emailConfigured, EMAIL_NOT_CONFIGURED } from "@/lib/send-email";
import { SEVERITY_LABEL, type Severity } from "@/lib/severity";
import type { LocalizedText } from "@/lib/types";

const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** What an official did to a barangay's alert: set or changed it, lifted it, or withdrew an automatic one. */
export type AlertChange = "set" | "lifted" | "withdrawn";

type ActiveAlert = { severity: string; message: LocalizedText } | null;

/**
 * The words for a change: English for push, as every push is, and both
 * languages by email.
 */
export function alertChangeNotice(
  zoneName: string,
  change: AlertChange,
  alert: ActiveAlert
): { title: string; body: string; emailText: string } {
  if (change === "set" && alert) {
    const label = SEVERITY_LABEL[alert.severity as Severity];
    return {
      title: `${zoneName}: ${label.en}`,
      body: alert.message.en,
      emailText: `${label.en} for ${zoneName}.\n${alert.message.en}\n\n${label.fil} para sa ${zoneName}.\n${alert.message.fil}`,
    };
  }
  const withdrawn = change === "withdrawn";
  const text: LocalizedText = withdrawn
    ? {
        en: `Your barangay withdrew the unverified flood advisory for ${zoneName}.`,
        fil: `Binawi ng inyong barangay ang hindi pa kumpirmadong paalala ng baha para sa ${zoneName}.`,
      }
    : { en: `${zoneName} lifted its flood alert.`, fil: `Inalis na ng ${zoneName} ang alerto ng baha.` };
  return {
    title: `${zoneName}: ${withdrawn ? "advisory withdrawn" : "alert lifted"}`,
    body: text.en,
    emailText: `${text.en}\n\n${text.fil}`,
  };
}

/**
 * Tells a barangay's residents, by push and by email, that an official
 * changed its alert. Best effort: the alert is already saved and on screen,
 * so a failure here is logged, never thrown.
 */
export async function notifyResidentsOfAlertChange(zoneId: string, change: AlertChange): Promise<void> {
  try {
    const supabase = service();
    const [{ data: zone }, { data: alert }] = await Promise.all([
      supabase.from("zones").select("name").eq("id", zoneId).maybeSingle(),
      supabase.from("alerts").select("severity, message").eq("zone_id", zoneId).eq("is_active", true).maybeSingle(),
    ]);
    if (!zone) return;

    const notice = alertChangeNotice(zone.name, change, alert as ActiveAlert);
    const [push, email] = await Promise.all([
      sendZonePush({ zoneId, title: notice.title, body: notice.body, url: "/" }),
      emailZone(zoneId, { subject: `WeatherWell: ${notice.title}`, text: notice.emailText }),
    ]);
    if (!push.ok) console.error(`Alert-change push failed for zone ${zoneId}: ${push.error}`);
    if (!email.ok && email.error !== EMAIL_NOT_CONFIGURED) {
      console.error(`Alert-change email failed for zone ${zoneId}: ${email.error}`);
    }
  } catch (error) {
    console.error("notifyResidentsOfAlertChange failed", error);
  }
}

/** Emails a barangay's residents about a new automatic advisory; the engine's run has already pushed it. */
export async function emailResidentsOfAdvisory(zoneId: string): Promise<void> {
  if (!emailConfigured()) return;
  try {
    const { data: zone } = await service().from("zones").select("name").eq("id", zoneId).maybeSingle();
    if (!zone) return;
    const result = await emailZone(zoneId, {
      subject: `WeatherWell: residents report flooding in ${zone.name}`,
      text:
        `Residents of ${zone.name} report flooding. This advisory is not yet confirmed by an official.\n\n` +
        `May ulat ng baha mula sa mga residente ng ${zone.name}. Hindi pa ito kumpirmado ng opisyal.`,
    });
    if (!result.ok && result.error !== EMAIL_NOT_CONFIGURED) {
      console.error(`Advisory email failed for zone ${zoneId}: ${result.error}`);
    }
  } catch (error) {
    console.error("emailResidentsOfAdvisory failed", error);
  }
}
