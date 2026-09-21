import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

const DEPTH_LABELS: Record<string, string> = {
  dry: "Dry", ankle: "Ankle", knee: "Knee", waist: "Waist", neck: "Neck",
};

export default async function ResidentReportsPage() {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  const ref = createSupabaseServerClient();
  const { data: reports } = await ref
    .from("water_level_reports")
    .select("id, zone_id, depth_level, reported_at")
    .eq("reporter_id", userId!)
    .order("reported_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">My Reports</h1>
      {!reports || reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reports yet. Submit one from the homepage map.</p>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{DEPTH_LABELS[r.depth_level] ?? r.depth_level}</p>
                  <p className="text-xs text-muted-foreground">{r.zone_id}</p>
                </div>
                <time className="text-xs text-muted-foreground">
                  {new Date(r.reported_at).toLocaleDateString()}
                </time>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
