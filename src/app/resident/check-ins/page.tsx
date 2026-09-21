import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { ResidentCheckInsList, type ResidentCheckInRow } from "@/features/resident/resident-check-ins-list";

export default async function ResidentCheckInsPage() {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  const { data: checkIns } = await supabase
    .from("evacuation_check_ins")
    .select("id, zone_id, status, checked_in_at")
    .eq("user_id", userId!)
    .order("checked_in_at", { ascending: false })
    .limit(50);

  const rows = checkIns ?? [];
  const zoneIds = [...new Set(rows.map((c) => c.zone_id))];
  const { data: zoneRows } = zoneIds.length
    ? await supabase.from("zones").select("id, name").in("id", zoneIds)
    : { data: [] as { id: string; name: string }[] };
  const zoneNames = new Map((zoneRows ?? []).map((z) => [z.id, z.name]));

  const checkInRows: ResidentCheckInRow[] = rows.map((c) => ({
    id: c.id,
    zoneName: zoneNames.get(c.zone_id) ?? c.zone_id,
    status: c.status,
    checkedInAt: c.checked_in_at,
  }));

  return <ResidentCheckInsList checkIns={checkInRows} />;
}
