import type { DepthLevel } from "@/lib/depth";

/** Widened in the next plan as pins, votes, check-ins and overrides migrate. */
export type OutboxOperation = "submitWaterLevelReport";

export interface OutboxPayloads {
  submitWaterLevelReport: { zoneId: string; depthLevel: DepthLevel };
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
