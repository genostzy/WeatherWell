import type { DepthLevel } from "@/lib/depth";
import type { PinStatusTag, PinRemovalReason } from "@/lib/community-pin";
import type { CheckInStatus } from "@/lib/types";

export type OutboxOperation =
  | "submitWaterLevelReport"
  | "createPin"
  | "editPin"
  | "deleteOwnPin"
  | "setPinRemoved"
  | "voteOnPin"
  | "recordCheckIn";

export interface OutboxPayloads {
  submitWaterLevelReport: {
    zoneId: string;
    depthLevel: DepthLevel;
    /** The device's position when the report was filed — omitted when unavailable (denied, no fix yet, an older build). See the geofence trigger's own comment for why that must never block the write. */
    lat?: number;
    lng?: number;
  };
  createPin: {
    zoneId: string;
    statusTag: PinStatusTag;
    caption: string;
    lat: number;
    lng: number;
  };
  editPin: { pinId: string; statusTag: PinStatusTag; caption: string };
  deleteOwnPin: { pinId: string };
  /**
   * An operator removing or restoring someone else's pin. Queued rather than
   * sent straight through, because an operator moderating from a barangay
   * hall during a storm is on the same connection as everyone else — and a
   * removal that silently failed is a pin the public map keeps showing.
   *
   * `reason` is carried even when `removed` is false, where it is ignored: a
   * restore clears the column, so there is nothing for the reason to say. It
   * stays non-optional so that a future third reason cannot be added to the
   * union and quietly omitted here on the removal path.
   */
  setPinRemoved: { pinId: string; removed: boolean; reason: PinRemovalReason };
  voteOnPin: { pinId: string; direction: 1 | -1 };
  recordCheckIn: { zoneId: string; status: CheckInStatus };
}

export type OutboxStatus = "pending" | "stuck" | "held";
export type StuckReason = "permanent" | "too_old" | "too_far" | "gave_up";

export interface OutboxEntry {
  /**
   * Generated on the client and used as the database row's primary key. This
   * is what makes replay idempotent — a re-sent entry conflicts on insert
   * rather than creating a duplicate report.
   */
  id: string;
  operation: OutboxOperation;
  payload: OutboxPayloads[OutboxOperation];
  queuedAt: string;
  attempts: number;
  /**
   * Who queued this (I2): the session's user id, or null when this device had
   * no identity yet. Only the matching session replays it; see
   * drainForCurrentSession. Absent on entries queued by an older build, which
   * are held because nothing says whose they are.
   */
  userId?: string | null;
  /** See `src/lib/outbox/schedule.ts` for how these five fields evolve. */
  status: OutboxStatus;
  nextAttemptAt: string | null;
  updatedAt: string;
  lastError?: string;
  stuckReason?: StuckReason;
  /**
   * Why a pending entry is waiting, when the server said: "rate_limited" is
   * one report per barangay every 5 minutes. null once a later attempt says
   * nothing, so a stale reason never outlives the wait it described.
   */
  waitReason?: "rate_limited" | null;
}
