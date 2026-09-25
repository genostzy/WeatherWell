import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/email/unsubscribe?token=…
 *
 * The button on /unsubscribe, and Gmail's own one-click Unsubscribe
 * (RFC 8058, the List-Unsubscribe-Post header). POST only, so a link
 * scanner opening an email's links cannot unsubscribe anyone.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!UUID.test(token)) {
    return NextResponse.json({ error: "This link is incomplete." }, { status: 400 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { error } = await supabase.rpc("unsubscribe_email_alerts", { p_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.redirect(new URL("/unsubscribe?done=1", request.url), 303);
}
