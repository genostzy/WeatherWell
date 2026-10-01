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
    let barangayCode: string | undefined;
    if (msg.zone_id) {
      const { data: zone } = await supabase.from("zones").select("name, psgc_barangay_code").eq("id", msg.zone_id).maybeSingle();
      barangayName = zone?.name ?? null;
      barangayCode = zone?.psgc_barangay_code;
    }
    const { title, body } = messageNotification(
      { direction, kind: msg.kind as MessageKind, body: msg.body, senderName: msg.sender_name },
      barangayName
    );
    await tellOfficials(messageRecipients({ direction, townCode: msg.town_code, barangayCode }, officials), title, body);
  } catch (error) {
    console.error("notifyOfficialsOfMessage failed", error);
  }
}

/** How far back a heads-up counts as the one this alert just left (the trigger writes it with the alert). */
const HEADS_UP_WINDOW_MS = 5 * 60_000;

/**
 * Tells the downstream barangay's officials, by push and email, about the
 * heads-up the database left when this barangay first went to Warning or
 * Evacuate (send_upstream_heads_up). Best effort, like the rest.
 */
export async function notifyDownstreamOfficials(zoneId: string): Promise<void> {
  try {
    const supabase = service();
    // By sender: several barangays may drain into one, and each push names its own.
    const { data: msg } = await supabase
      .from("official_messages")
      .select("id")
      .eq("direction", "heads_up")
      .eq("from_zone_id", zoneId)
      .gte("created_at", new Date(Date.now() - HEADS_UP_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (msg) await notifyOfficialsOfMessage(msg.id);
  } catch (error) {
    console.error("notifyDownstreamOfficials failed", error);
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
