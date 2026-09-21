import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { Card, CardContent } from "@/components/ui/card";

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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">My Check-ins</h1>
      {!checkIns || checkIns.length === 0 ? (
        <p className="text-sm text-muted-foreground">No check-ins yet. You can check in from the evacuation page.</p>
      ) : (
        <div className="space-y-2">
          {checkIns.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">
                    {c.status === "safe" ? "Safe" : "Needs Help"}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.zone_id}</p>
                </div>
                <time className="text-xs text-muted-foreground">
                  {new Date(c.checked_in_at).toLocaleDateString()}
                </time>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
