import "server-only";
import { createClient } from "@supabase/supabase-js";
import { sendUsersPush } from "@/lib/send-zone-push";
import { emailUsers } from "@/lib/email-alerts";
import { advisoryRecipients, messageNotification, messageRecipients, type OfficialArea } from "@/lib/official-recipients";
import type { MessageDirection, MessageKind } from "@/lib/official-messages";

const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** Every official whose area is in this town: the town's own, and its barangays'. */
async function officialsInTown(supabase: ReturnType<typeof service>, townCode: string): Promise<OfficialArea[]> {
  const { data } = await supabase.from("profiles").select("id, area_code").eq("role", "operator").like("area_code", `${townCode}%`);
  return (data ?? []).filter((row) => row.area_code).map((row) => ({ id: row.id as string, areaCode: row.area_code as string }));
}

/** By push, and by email to those who turned email alerts on. */
async function tellOfficials(userIds: string[], title: string, body: string): Promise<void> {
  await sendUsersPush({ userIds, title, body });
  await emailUsers(userIds, { subject: `WeatherWell: ${title}`, text: body, path: "/admin" });
}

/**
 * Tells the right officials, on their phones, about an update just sent
 * between a barangay and its town. Best effort: the update is already saved
 * and on their dashboards; a failure here is logged, never thrown.
 */
export async function notifyOfficialsOfMessage(messageId: string): Promise<void> {
  try {
    const supabase = service();
    const { data: msg } = await supabase
      .from("official_messages")
      .select("town_code, direction, zone_id, kind, body, sender_name")
      .eq("id", messageId)
      .maybeSingle();
    if (!msg) return;

    const direction = msg.direction as MessageDirection;
    const officials = await officialsInTown(supabase, msg.town_code);
    let barangayName: string | null = null;
    if (msg.zone_id) {
      const { data: zone } = await supabase.from("zones").select("name").eq("id", msg.zone_id).maybeSingle();
      barangayName = zone?.name ?? null;
    }
    const { title, body } = messageNotification(
      { direction, kind: msg.kind as MessageKind, body: msg.body, senderName: msg.sender_name },
      barangayName
    );
    await tellOfficials(messageRecipients({ direction, townCode: msg.town_code }, officials), title, body);
  } catch (error) {
    console.error("notifyOfficialsOfMessage failed", error);
  }
}

/** Tells a barangay's official (who must confirm or reject it) and its town's about a new automatic advisory. */
export async function notifyOfficialsOfAdvisory(zoneId: string): Promise<void> {
  try {
    const supabase = service();
    const { data: zone } = await supabase.from("zones").select("name, psgc_barangay_code").eq("id", zoneId).maybeSingle();
    if (!zone) return;
    const officials = await officialsInTown(supabase, zone.psgc_barangay_code.slice(0, 7));
    await tellOfficials(
      advisoryRecipients(zone.psgc_barangay_code, officials),
      `${zone.name}: residents report flooding`,
      "An automatic advisory is up, marked unverified. Confirm or reject it on your dashboard."
    );
  } catch (error) {
    console.error("notifyOfficialsOfAdvisory failed", error);
  }
}
