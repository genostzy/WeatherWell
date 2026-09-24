import { redirect } from "next/navigation";
import { loadOfficial } from "@/lib/auth/load-official";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { AdminOverview } from "@/features/admin/admin-overview";

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
    return <AdminOverview townOfficials={townOfficials} />;
  }
  return <AdminOverview />;
}
