import type { Metadata } from "next";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { ResidentReportsList, type ResidentReportRow } from "@/features/resident/resident-reports-list";

export const metadata: Metadata = { title: "Your reports" };

export default async function ResidentReportsPage() {
  const supabase = await createSupabaseUserClient();
  // reporter_id is no longer readable (it links one device's reports
  // together); a resident's own reports come through this function instead.
  const { data: reports } = await supabase
    .rpc("my_water_level_reports")
    .order("reported_at", { ascending: false })
    .limit(50);

  const rows = reports ?? [];
  const zoneIds = [...new Set(rows.map((r) => r.zone_id))];
  const { data: zoneRows } = zoneIds.length
    ? await supabase.from("zones").select("id, name").in("id", zoneIds)
    : { data: [] as { id: string; name: string }[] };
  const zoneNames = new Map((zoneRows ?? []).map((z) => [z.id, z.name]));

  const reportRows: ResidentReportRow[] = rows.map((r) => ({
    id: r.id,
    zoneName: zoneNames.get(r.zone_id) ?? r.zone_id,
    depthLevel: r.depth_level,
    reportedAt: r.reported_at,
  }));

  return <ResidentReportsList reports={reportRows} />;
}
