import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "@/app/actions/action-result";
import { reportError } from "@/lib/monitoring/report";

const HEADERS = { "Cache-Control": "no-store" };

function reply(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status, headers: HEADERS });
}

/**
 * An ISO 8601 date-time with an explicit zone (what `Date#toISOString` writes
 * on both clients), as epoch milliseconds, or null for anything else.
 * `Date.parse` alone is not enough: it accepts forms like "Sep 16 2026" that
 * the queue never writes.
 */
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

function parseIsoTime(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_DATE_TIME.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

type Runner = (id: string, payload: Record<string, unknown>, madeAt: string) => Promise<ActionResult>;

/**
 * When the write was made, on the SERVER's clock (design doc section 2, as
 * amended): `serverNow - max(0, sentAt - queuedAt)`.
 *
 * `queuedAt` and `sentAt` both come from the device's clock, which on a
 * cheap phone can be hours or days wrong after a flat battery. Their
 * difference is still right — both were read from that one clock — so only
 * the elapsed interval is trusted, and it is applied to this server's own
 * time. A negative interval (the clock was set back between queueing and
 * sending) counts as zero. A missing or unusable `sentAt` (an older client)
 * falls back to arrival time, which is how every write was dated before
 * the queue kept made-at times at all.
 */
function madeAtOnServer(queuedAtMs: number, sentAt: unknown): string {
  const serverNow = Date.now();
  const sentAtMs = parseIsoTime(sentAt);
  if (sentAtMs === null) return new Date(serverNow).toISOString();
  const elapsed = Math.max(0, sentAtMs - queuedAtMs);
  return new Date(serverNow - elapsed).toISOString();
}

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
 * time, so their runners ignore it entirely.
 */
const RUNNERS: Record<string, Runner> = {
  submitWaterLevelReport: async (id, payload, madeAt) =>
    (await import("@/app/actions/submit-water-level-report")).submitWaterLevelReport({
      ...payload,
      // After the spread: the queue's own id and time always win over anything
      // a payload carries, so a replay stays idempotent by the entry id.
      id,
      madeAt,
    } as never),
  recordCheckIn: async (id, payload, madeAt) =>
    (await import("@/app/actions/record-check-in")).recordCheckIn({
      ...payload,
      // After the spread: the queue's own id and time always win over anything
      // a payload carries, so a replay stays idempotent by the entry id.
      id,
      madeAt,
    } as never),
  createPin: async (id, payload) =>
    (await import("@/app/actions/pins")).createPin({ ...payload, id } as never),
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
  // Own keys only: a plain-object lookup would resolve "constructor",
  // "toString" and friends to Object.prototype members.
  const run = Object.hasOwn(RUNNERS, operation) ? RUNNERS[operation] : undefined;
  if (!run) return reply(404, { result: "permanent", reason: "unknown_operation" });

  let body: { id?: unknown; userId?: unknown; queuedAt?: unknown; sentAt?: unknown; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply(422, { result: "permanent", reason: "invalid" });
  }
  if (typeof body.id !== "string" || typeof body.payload !== "object" || body.payload === null) {
    return reply(422, { result: "permanent", reason: "invalid" });
  }
  // Checked here, before anything runs: an unusable time would otherwise
  // reach Postgres as 22007, which reads as transient and burns all ten
  // retries on a write that can never succeed.
  const queuedAt = parseIsoTime(body.queuedAt);
  if (queuedAt === null) return reply(422, { result: "permanent", reason: "invalid" });

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
    const madeAt = madeAtOnServer(queuedAt, body.sentAt);
    const result = await run(body.id, body.payload as Record<string, unknown>, madeAt);
    if (result.ok) return reply(200, { result: "delivered" });
    if (result.permanent) return reply(422, { result: "permanent", reason: result.reason ?? result.error });
    return reply(503, { result: "retry" });
  } catch (error) {
    // Every resident write comes through here, and this catch turns any
    // throw into a retry, so without a report a crash on the write path
    // would only ever surface as "tried many times" ten attempts later.
    // Awaited, so the report is not cut off once the response is sent.
    // Only the route is passed — never anything from the body — and
    // reportError scrubs the message and swallows its own failures; the
    // extra catch keeps even a broken monitor from changing this answer.
    try {
      await reportError(error, { source: "server", kind: "request", route: `/api/outbox/${operation}` });
    } catch {
      // Monitoring failing must not change what the queue is told.
    }
    // Never surfaces the caught error's text: a stray exception (a network
    // blip talking to Postgres, an unexpected throw inside an action) is
    // always transient from this route's point of view, and its message is
    // not something a queued write's caller should see.
    return reply(503, { result: "retry" });
  }
}
