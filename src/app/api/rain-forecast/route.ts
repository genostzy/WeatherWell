import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runRainForecast } from "@/lib/rain-forecast";

export const dynamic = "force-dynamic";

/**
 * GET /api/rain-forecast
 *
 * The hourly rain heads-up (rain-forecast.yml, started by pg_cron at five
 * past the hour). A failed run answers 502, so the workflow run fails and
 * the owner sees it.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runRainForecast());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
