import type { DepthLevel } from "@/lib/depth";
import type { PinStatusTag } from "@/lib/community-pin";
import type { CheckInStatus } from "@/lib/types";

export type OutboxOperation =
  | "submitWaterLevelReport"
  | "createPin"
  | "editPin"
  | "deleteOwnPin"
  | "voteOnPin"
  | "recordCheckIn";

export interface OutboxPayloads {
  submitWaterLevelReport: { zoneId: string; depthLevel: DepthLevel };
  createPin: {
    zoneId: string;
    statusTag: PinStatusTag;
    caption: string;
    lat: number;
    lng: number;
  };
  editPin: { pinId: string; statusTag: PinStatusTag; caption: string };
  deleteOwnPin: { pinId: string };
  voteOnPin: { pinId: string; direction: 1 | -1 };
  recordCheckIn: { zoneId: string; status: CheckInStatus };
}

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
  lastError?: string;
  /** True when retrying cannot help — an RLS denial, a validation rejection. */
  permanentlyFailed: boolean;
}
