import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { safeNext } from "@/lib/auth/safe-next";

const NO_STORE = { "Cache-Control": "no-store" };
const ALLOWED: EmailOtpType[] = ["email", "email_change"];

/**
 * Where an email sign-in link lands. Uses the link's one-time token_hash
 * (Supabase's recommended server-side pattern) rather than a code exchange,
 * which cannot complete when the link opens in a different browser from the
 * one that asked for it. Needs setup step 6 (email templates).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type && ALLOWED.includes(type)) {
    const supabase = await createSupabaseUserClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin), { headers: NO_STORE });
  }

  const back = new URL("/sign-in", url.origin);
  back.searchParams.set("next", next);
  back.searchParams.set("notice", "failed");
  return NextResponse.redirect(back, { headers: NO_STORE });
}
