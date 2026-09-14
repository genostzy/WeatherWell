import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { safeNext } from "@/lib/auth/safe-next";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Where Google sends an official (or a resident linking an account) back to.
 * Exchanges the one-time code for a session cookie. Any failure — including a
 * Google account that already belongs to another user, which makes linking
 * fail — returns to /sign-in, which then offers "Sign in to my existing
 * account". The page handles every failure the same way, so this route never
 * depends on the exact error code Supabase uses.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");

  if (code && !url.searchParams.get("error")) {
    const supabase = await createSupabaseUserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin), { headers: NO_STORE });
  }

  const back = new URL("/sign-in", url.origin);
  back.searchParams.set("next", next);
  back.searchParams.set("notice", "failed");
  return NextResponse.redirect(back, { headers: NO_STORE });
}
