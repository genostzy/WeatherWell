import { loadOfficial } from "@/lib/auth/load-official";
import { redirect } from "next/navigation";
import { AdminOverview } from "@/features/admin/admin-overview";
import { landingPathFor } from "@/lib/auth/official";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OfficialPage() {
  const gate = await loadOfficial();
  if (gate.state !== "official") redirect("/sign-in?next=/official");
  
  if (gate.official.level === "barangay") {
    const { data } = await createSupabaseServerClient().from("zones").select("id, psgc_barangay_code");
    const path = landingPathFor(
      gate.official,
      (data ?? []).map((z) => ({ id: z.id, psgcBarangayCode: z.psgc_barangay_code }))
    );
    if (path) redirect(path);
  }
  
  return <AdminOverview />;
}
