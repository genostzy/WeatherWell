import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { ResidentOverview } from "@/features/resident/resident-overview";

export default async function ResidentOverviewPage() {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  const { data: profile } = await supabase
    .from("profiles")
    .select("zone_id")
    .eq("id", userId!)
    .maybeSingle();

  const { count: reportCount } = await supabase
    .from("water_level_reports")
    .select("*", { count: "exact", head: true })
    .eq("reporter_id", userId!);

  const { count: pinCount } = await supabase
    .from("community_pins")
    .select("*", { count: "exact", head: true })
    .eq("author_id", userId!)
    .eq("removed", false);

  const { count: checkInCount } = await supabase
    .from("evacuation_check_ins")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId!);

  let zoneName: string | null = null;
  if (profile?.zone_id) {
    const { data: zone } = await supabase.from("zones").select("name").eq("id", profile.zone_id).maybeSingle();
    zoneName = zone?.name ?? profile.zone_id;
  }

  return (
    <ResidentOverview
      zoneName={zoneName}
      reportCount={reportCount ?? 0}
      checkInCount={checkInCount ?? 0}
      pinCount={pinCount ?? 0}
    />
  );
}
