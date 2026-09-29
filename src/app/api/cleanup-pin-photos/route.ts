import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/** Storage deletes per request. */
const BATCH = 100;

/**
 * GET /api/cleanup-pin-photos
 *
 * Daily Vercel cron. Deletes pin photos over 7 days old, photos of removed
 * pins, and uploads over an hour old that no pin points to (the list comes
 * from pin_photos_to_delete), through the Storage API: removing a row from
 * storage.objects in SQL would leave the file behind. Clears photo_path on
 * the pins it touched. Service role, so the cron secret is required.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data, error } = await supabase.rpc("pin_photos_to_delete");
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  const paths = ((data ?? []) as { path: string }[]).map((row) => row.path);
  for (let i = 0; i < paths.length; i += BATCH) {
    const { error: removeError } = await supabase.storage.from("pin-photos").remove(paths.slice(i, i + BATCH));
    if (removeError) return NextResponse.json({ error: removeError.message }, { status: 502 });
  }
  if (paths.length > 0) {
    const { error: clearError } = await supabase.from("community_pins").update({ photo_path: null }).in("photo_path", paths);
    if (clearError) return NextResponse.json({ error: clearError.message }, { status: 502 });
  }

  return NextResponse.json({ deleted: paths.length });
}
