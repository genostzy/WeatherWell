import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runThresholdCheck } from "@/lib/threshold-check";

export const dynamic = "force-dynamic";

async function respond(): Promise<NextResponse> {
  const result = await runThresholdCheck();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  if (result.triggered === 0) return NextResponse.json({ triggered: 0, message: "No alerts triggered" });
  return NextResponse.json({ triggered: result.triggered, pushSent: result.pushSent, results: result.results });
}

/**
 * GET /api/threshold-check
 *
 * Vercel Cron always sends GET, never POST — this was previously a stub
 * that echoed static config, which meant the daily scheduled run in
 * vercel.json never actually executed the threshold engine below. GET now
 * runs the real check; POST is kept as an equivalent manually-triggerable
 * path. Both require the same cron secret.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return respond();
}

/** POST /api/threshold-check — see GET's doc comment. */
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return respond();
}
