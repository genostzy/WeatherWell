import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "@/app/actions/action-result";

const HEADERS = { "Cache-Control": "no-store" };

function reply(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status, headers: HEADERS });
}

type Runner = (id: string, payload: Record<string, unknown>, queuedAt: string) => Promise<ActionResult>;

/**
 * One runner per operation, each importing and calling the exact Server
 * Action a direct, non-queued call would use — there is still one
 * implementation of every rule (design doc, "Worker endpoints"). Imported
 * dynamically, not at module scope, for the same reason `dispatchers.ts`
 * does: every action pulls in `user-server.ts`'s `import "server-only"`
 * transitively, and splitting the import per branch means a request for one
 * operation never evaluates the other six actions' modules.
 *
 * `madeAt` is only threaded through for the two operations whose tables
 * enforce honest write times (`submitWaterLevelReport`, `recordCheckIn`) —
 * see the design doc's section 2. Pins, votes and moderation keep arrival
 * time, so their runners ignore `queuedAt` entirely.
 */
const RUNNERS: Record<string, Runner> = {
  submitWaterLevelReport: async (id, payload, madeAt) =>
    (await import("@/app/actions/submit-water-level-report")).submitWaterLevelReport({
      id,
      ...payload,
      madeAt,
    } as never),
  recordCheckIn: async (id, payload, madeAt) =>
    (await import("@/app/actions/record-check-in")).recordCheckIn({
      id,
      ...payload,
      madeAt,
    } as never),
  createPin: async (id, payload) =>
    (await import("@/app/actions/pins")).createPin({ id, ...payload } as never),
  editPin: async (_id, payload) => (await import("@/app/actions/pins")).editPin(payload as never),
  deleteOwnPin: async (_id, payload) => (await import("@/app/actions/pins")).deleteOwnPin(payload as never),
  setPinRemoved: async (_id, payload) => (await import("@/app/actions/pins")).setPinRemoved(payload as never),
  voteOnPin: async (_id, payload) => (await import("@/app/actions/vote-on-pin")).voteOnPin(payload as never),
};

/**
 * The queue's one way in, for the page and the service worker alike.
 *
 * The server checks the entry belongs to whoever is signed in right now —
 * with `auth.getClaims`, never the session-reading equivalent, because only
 * the former revalidates the JWT against the project's published keys — so
 * a shared phone or a stale tab can never send one person's queued write as
 * another's. Once that check passes, this runs the same Server Action code
 * a direct, non-queued call runs; there is still one implementation of
 * every write's rules.
 *
 * Every response, success or failure, carries `Cache-Control: no-store`:
 * the body says whether a specific write landed, which must never be served
 * from a shared cache to a different request.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> }
) {
  const { operation } = await params;
  const run = RUNNERS[operation];
  if (!run) return reply(404, { result: "permanent", reason: "unknown_operation" });

  let body: { id?: unknown; userId?: unknown; queuedAt?: unknown; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply(422, { result: "permanent", reason: "invalid" });
  }
  if (typeof body.id !== "string" || typeof body.payload !== "object" || body.payload === null) {
    return reply(422, { result: "permanent", reason: "invalid" });
  }

  const supabase = await createSupabaseUserClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return reply(401, { result: "signed_out" });
  // A `userId` that does not match the current session — including `null`,
  // an entry never claimed by anyone — is held here rather than sent. An
  // unowned first write is the page's job to claim before it ever reaches
  // this route (design doc, "An unowned first write").
  if (body.userId !== sub) return reply(409, { result: "held" });

  try {
    const queuedAt = typeof body.queuedAt === "string" ? body.queuedAt : new Date().toISOString();
    const result = await run(body.id, body.payload as Record<string, unknown>, queuedAt);
    if (result.ok) return reply(200, { result: "delivered" });
    if (result.permanent) return reply(422, { result: "permanent", reason: result.reason ?? result.error });
    return reply(503, { result: "retry" });
  } catch {
    // Never surfaces the caught error's text: a stray exception (a network
    // blip talking to Postgres, an unexpected throw inside an action) is
    // always transient from this route's point of view, and its message is
    // not something a queued write's caller should see.
    return reply(503, { result: "retry" });
  }
}
