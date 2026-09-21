import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { ResidentPinsList, type ResidentPinRow } from "@/features/resident/resident-pins-list";

export default async function ResidentPinsPage() {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  const { data: pins } = await supabase
    .from("community_pins")
    .select("id, zone_id, status_tag, caption, created_at, removed")
    .eq("author_id", userId!)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = pins ?? [];
  const zoneIds = [...new Set(rows.map((p) => p.zone_id))];
  const { data: zoneRows } = zoneIds.length
    ? await supabase.from("zones").select("id, name").in("id", zoneIds)
    : { data: [] as { id: string; name: string }[] };
  const zoneNames = new Map((zoneRows ?? []).map((z) => [z.id, z.name]));

  const pinRows: ResidentPinRow[] = rows.map((p) => ({
    id: p.id,
    zoneName: zoneNames.get(p.zone_id) ?? p.zone_id,
    statusTag: p.status_tag,
    caption: p.caption,
    createdAt: p.created_at,
    removed: p.removed,
  }));

  return <ResidentPinsList pins={pinRows} />;
}
