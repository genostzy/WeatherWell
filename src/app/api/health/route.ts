import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const HEADERS = { "Cache-Control": "no-store" };
const TIMEOUT_MS = 5000;

function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
  ]);
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
      const count = await withTimeout(supabase.rpc("recent_app_error_count"));
      if (!count.error && typeof count.data === "number") recentErrors = count.data;
    } catch {
      // A missing count is not an outage.
    }

    return NextResponse.json({ status: "ok", database: "ok", recentErrors }, { headers: HEADERS });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: HEADERS });
  }
}
