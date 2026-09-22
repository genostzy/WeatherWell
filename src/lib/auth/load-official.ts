import "server-only";
import { cache } from "react";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { areaLevel, type Official } from "./official";

type GateState =
  | { state: "signed-out" }
  | { state: "not-appointed"; email: string | null }
  | { state: "official"; official: Official };

/**
 * Who is asking, from the VERIFIED session (getClaims, never getSession) and
 * their own profile row. Cached per request, so the layout and the page share
 * one lookup. This decides what the dashboard shows; the database still
 * refuses anything outside the official's area however a request arrives.
 */
export const loadOfficial = cache(async (): Promise<GateState> => {
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { state: "signed-out" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, area_code, display_name")
    .eq("id", claims.sub)
    .maybeSingle();

  if (profile?.role === "admin") {
    if (!profile.display_name) {
      const email = typeof claims.email === "string" && claims.email ? claims.email : null;
      return { state: "not-appointed", email };
    }
    // No zone/municipality lookup: an admin's area_code is NULL by design
    // (Task 1's admin_has_name constraint), and a Postgrest .eq(col, null)
    // filter can only ever return zero rows — attempting it would be dead
    // code that always fell through to the raw-code fallback anyway.
    return {
      state: "official",
      official: {
        userId: claims.sub,
        displayName: profile.display_name,
        areaCode: "",
        areaName: "All areas",
        level: "admin",
      },
    };
  }

  if (profile?.role !== "operator" || !profile.area_code || !profile.display_name) {
    const email = typeof claims.email === "string" && claims.email ? claims.email : null;
    return { state: "not-appointed", email };
  }

  const level = areaLevel(profile.area_code);
  const reference = createSupabaseServerClient();
  const { data: place } =
    level === "barangay"
      ? await reference.from("zones").select("name").eq("psgc_barangay_code", profile.area_code).maybeSingle()
      : await reference.from("municipalities").select("name").eq("code", profile.area_code).maybeSingle();

  return {
    state: "official",
    official: {
      userId: claims.sub,
      displayName: profile.display_name,
      areaCode: profile.area_code,
      areaName: place?.name ?? profile.area_code,
      level,
    },
  };
});
