import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { safeNext } from "@/lib/auth/safe-next";

/** POST so a stray link or prefetch can never sign someone out. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const next = safeNext(typeof form.get("next") === "string" ? (form.get("next") as string) : null);
  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) await supabase.auth.signOut();
  return NextResponse.redirect(new URL(next, request.url), { status: 303, headers: { "Cache-Control": "no-store" } });
}
