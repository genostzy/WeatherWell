import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

export default async function ResidentPinsPage() {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  const ref = createSupabaseServerClient();
  const { data: pins } = await ref
    .from("community_pins")
    .select("id, status_tag, caption, created_at, removed")
    .eq("author_id", userId!)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">My Pins</h1>
      {!pins || pins.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pins yet. Drop one from the homepage map.</p>
      ) : (
        <div className="space-y-2">
          {pins.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">
                    {p.status_tag}
                    {p.removed && <span className="ml-2 text-xs text-severity-red">(Removed)</span>}
                  </p>
                  {p.caption && <p className="text-xs text-muted-foreground">{p.caption}</p>}
                </div>
                <div className="text-right">
                  <time className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString()}
                  </time>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
