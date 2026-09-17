import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { monitoringEnvironment } from "@/lib/monitoring/report";

const HEADERS = { "Cache-Control": "no-store" };
const TIMEOUT_MS = 5000;

/**
 * Races a promise against a timeout. `Promise.race` never cancels the
 * loser, so on a fast success the timer would otherwise stay alive for up to
 * TIMEOUT_MS after the response is already sent — a real cost for an
 * endpoint a monitor polls indefinitely. Clearing it in `finally` (which
 * runs once the race settles, whichever side won) avoids that.
 */
function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

/**
 * The monitor's one question: is the app running and can it reach its
 * database? Answers with a status and a count only — never an internal
 * message — because anyone can call it.
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await withTimeout(supabase.from("zones").select("id").limit(1));
    if (error) throw new Error("database");

    let recentErrors = 0;
    try {
      // Only this deployment's own errors: a crash on a preview must never
      // fail the production watcher. Where the environment is unknown, every
      // environment is counted.
      const environment = monitoringEnvironment();
      const count = await withTimeout(
        supabase.rpc("recent_app_error_count", environment ? { p_environment: environment } : {})
      );
      if (!count.error && typeof count.data === "number") recentErrors = count.data;
    } catch {
      // A missing count is not an outage.
    }

    return NextResponse.json({ status: "ok", database: "ok", recentErrors }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: HEADERS });
  }
}
