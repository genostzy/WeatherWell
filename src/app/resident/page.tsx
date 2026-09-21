import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  let zoneName = "No zone selected";
  if (profile?.zone_id) {
    const { data: zone } = await supabase.from("zones").select("name").eq("id", profile.zone_id).maybeSingle();
    zoneName = zone?.name ?? profile.zone_id;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">My Dashboard</h1>
      <p className="text-sm text-muted-foreground">Zone: {zoneName}</p>
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-2xl font-bold">{reportCount ?? 0}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-muted-foreground">Reports</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-2xl font-bold">{checkInCount ?? 0}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-muted-foreground">Check-ins</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-2xl font-bold">{pinCount ?? 0}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-xs text-muted-foreground">Pins</p></CardContent>
        </Card>
      </div>
    </div>
  );
}
