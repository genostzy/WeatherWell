import { loadOfficial } from "@/lib/auth/load-official";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default async function OfficialZonesPage() {
  const gate = await loadOfficial();
  if (gate.state !== "official") redirect("/sign-in?next=/official");

  const ref = createSupabaseServerClient();
  const prefix = gate.official.areaCode;
  const { data: zones } = await ref
    .from("zones")
    .select("id, name, psgc_barangay_code")
    .like("psgc_barangay_code", `${prefix}%`)
    .order("name");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Zones</h1>
      <p className="text-sm text-muted-foreground">
        {gate.official.areaName} — {zones?.length ?? 0} zones
      </p>
      {!zones || zones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No zones in your area.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {zones.map((zone) => (
            <Link key={zone.id} href={`/admin/zone/${zone.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="py-3">
                  <p className="text-sm font-medium">{zone.name}</p>
                  <p className="text-xs text-muted-foreground">{zone.psgc_barangay_code}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
