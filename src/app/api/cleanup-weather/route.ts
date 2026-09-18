import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * GET /api/cleanup-weather
 *
 * Cron-triggered endpoint (Vercel cron: every 6 hours).
 * Deletes weather readings older than 48 hours to keep the table lean.
 * Uses service_role to bypass RLS for bulk delete.
 */
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("weather_readings" as never)
    .delete()
    .lt("fetched_at" as never, cutoff as never);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: count ?? 0, cutoff });
}
