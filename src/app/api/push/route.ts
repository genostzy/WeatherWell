import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { sendZonePush } from "@/lib/send-zone-push";

export const dynamic = "force-dynamic";

/** Ten sends a minute from one address, on top of the cron secret. */
const allow = createRateLimiter(10, 60_000);


/**
 * POST /api/push
 *
 * Manually-triggerable path for sending a Web Push notification to a zone's
 * subscribers — the threshold-check cron does not call this over HTTP, it
 * calls sendZonePush() directly (see that module for why). This route is
 * for the same kind of on-demand use as /api/threshold-check's own POST:
 * requires the cron secret, same as every other route holding the
 * service-role key.
 *
 * Body: { zoneId: string, title: string, body: string, url?: string }
 */
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!allow(clientIp(request))) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const { zoneId, title, body: messageBody, url } = body;

  if (!zoneId || !title || !messageBody) {
    return NextResponse.json(
      { error: "zoneId, title, and body required" },
      { status: 400 }
    );
  }

  const result = await sendZonePush({ zoneId, title, body: messageBody, url });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ sent: result.sent, failed: result.failed, total: result.total });
}

/**
 * GET /api/push
 *
 * Returns push configuration for client-side setup.
 */
export async function GET() {
  return NextResponse.json({
    supported: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY,
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}
