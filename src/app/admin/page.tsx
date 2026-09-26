import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadOfficial } from "@/lib/auth/load-official";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { AdminOverview } from "@/features/admin/admin-overview";
import type { CalibrationEvent, CalibrationKind } from "@/features/admin/calibration-panel";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The calibration loop's record (Stage 4 Task 3): the newest outcomes and the
 * raised bars. Officials may read it, as they read the action record; the
 * dashboard shows the part inside its own area. A town's part is filtered in
 * the query, before the limit: the newest 30 nationwide can all be elsewhere.
 */
async function loadCalibration(
  areaCode: string | null
): Promise<{ bars: Record<string, number>; events: CalibrationEvent[] }> {
  const supabase = await createSupabaseUserClient();
  let events = supabase
    .from("calibration_events")
    .select("id, zone_id, kind, step_before, step_after, occurred_at, zones!inner(psgc_barangay_code)");
  let floors = supabase.from("zone_alert_floors").select("zone_id, step, zones!inner(psgc_barangay_code)").gt("step", 0);
  if (areaCode) {
    events = events.like("zones.psgc_barangay_code", `${areaCode}%`);
    floors = floors.like("zones.psgc_barangay_code", `${areaCode}%`);
  }
  const [eventRows, floorRows] = await Promise.all([events.order("occurred_at", { ascending: false }).limit(30), floors]);
  return {
    bars: Object.fromEntries((floorRows.data ?? []).map((row) => [row.zone_id, row.step])),
    events: (eventRows.data ?? []).map((row) => ({
      id: row.id,
      zoneId: row.zone_id,
      kind: row.kind as CalibrationKind,
      stepBefore: row.step_before,
      stepAfter: row.step_after,
      occurredAt: row.occurred_at,
    })),
  };
}

/**
 * A barangay official's home is their own barangay's page (which carries the
 * "Needs your attention" inbox); everyone else gets the overview. Looks up
 * only that one barangay: an unranged read of the zones table stops at
 * PostgREST's 1,000-row cap, which left most barangay officials on the
 * overview instead.
 */
export default async function AdminPage() {
  const gate = await loadOfficial();
  if (gate.state === "official" && gate.official.level === "barangay") {
    const { data } = await createSupabaseServerClient()
      .from("zones")
      .select("id")
      .eq("psgc_barangay_code", gate.official.areaCode)
      .maybeSingle();
    if (data) redirect(`/admin/zone/${data.id}`);
  }
  if (gate.state === "official" && gate.official.level === "municipality") {
    // Who is appointed where in their town, for the Barangays panel. The
    // database answers only for the caller's own town.
    const { data } = await (await createSupabaseUserClient()).rpc("town_officials");
    const townOfficials = (data ?? []).map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      areaCode: row.area_code,
    }));
    return <AdminOverview townOfficials={townOfficials} calibration={await loadCalibration(gate.official.areaCode)} />;
  }
  if (gate.state === "official" && gate.official.level === "admin") {
    return <AdminOverview calibration={await loadCalibration(null)} />;
  }
  return <AdminOverview />;
}
