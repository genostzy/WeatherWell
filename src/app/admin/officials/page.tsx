import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { loadOfficial } from "@/lib/auth/load-official";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { toOfficialRows } from "@/lib/official-rows-mapper";
import { OfficialsPanel } from "@/features/admin/officials-panel";

/**
 * Admin-only. The /admin layout has already gated this request to a
 * signed-in, appointed official (admin or otherwise) — this page adds the
 * one further check that matters here: level === "admin". An official
 * visiting this URL directly gets a 404, not a redirect that would hint at
 * this page's existence. The row-shaping logic itself lives in
 * official-rows-mapper.ts (see its own test) — this page is composition
 * only, same split as /admin/history and official-actions-mapper.ts.
 *
 * profiles is read with the USER client, not createSupabaseServerClient's
 * anon one: profiles has no anon grant and its RLS policy resolves
 * auth.uid() (see profiles_read_own_or_operator) — an unauthenticated
 * client would see zero rows. zones/municipalities stay on the public
 * client since both are `select using (true)` to anon, same as
 * /admin/history's own zones read.
 */
export default async function OfficialsPage() {
  const gate = await loadOfficial();
  if (gate.state !== "official" || gate.official.level !== "admin") {
    notFound();
  }

  const { data: profiles } = await (await createSupabaseUserClient())
    .from("profiles")
    .select("id, display_name, area_code")
    .eq("role", "operator");

  // Only the areas these officials hold (M1): the zones table is ~42k rows,
  // and an unranged read stops at PostgREST's 1,000-row cap, so most
  // barangay officials' areas came back unnamed.
  const areaCodes = [...new Set((profiles ?? []).map((p) => p.area_code).filter((code): code is string => !!code))];
  const [{ data: zones }, { data: municipalities }] = areaCodes.length
    ? await Promise.all([
        createSupabaseServerClient().from("zones").select("psgc_barangay_code, name").in("psgc_barangay_code", areaCodes),
        createSupabaseServerClient().from("municipalities").select("code, name").in("code", areaCodes),
      ])
    : [{ data: [] }, { data: [] }];

  // Emails live in auth.users, not profiles, and reading auth.users needs
  // the service-role key (createSupabaseServerClient uses the publishable
  // key, RLS-enforced — same construction as every other admin-only
  // service-role read in this codebase, e.g. src/app/api/threshold-check/
  // route.ts). Fetched per-official by id (getUserById), not listUsers():
  // this project's auth.users also holds every anonymous resident session,
  // and there is no reason this page's read should be sized to that when
  // the officials list itself is a handful of rows.
  const adminAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ).auth.admin;
  const emailById = new Map(
    await Promise.all(
      (profiles ?? []).map(async (profile) => {
        const { data } = await adminAuth.getUserById(profile.id);
        return [profile.id, data.user?.email ?? "(unknown)"] as const;
      })
    )
  );

  const rows = toOfficialRows(
    profiles ?? [],
    (zones ?? []).map((z) => ({ code: z.psgc_barangay_code, name: z.name })),
    municipalities ?? [],
    emailById
  );

  return <OfficialsPanel officials={rows} />;
}
