import type { AlertRecord } from "./types";

/**
 * The pure row → AlertRecord mapping, split out of alerts-store.ts because
 * that file is "use client" (it holds the AlertsContext hooks) and Next's
 * RSC bundler turns every export of a "use client" module into a client
 * reference for server callers — so /api/alerts's route handler, which runs
 * on the server, cannot call a function imported from there directly.
 *
 * This module must stay free of "use client" and must NOT be merged back
 * into alerts-store.ts, and alerts-store.ts must not re-export from here
 * either — any of those would put toAlertRecords behind a client boundary
 * again and reintroduce the same 500 for the next route handler that calls
 * it. Import toAlertRecords directly from this file, not from alerts-store.
 * The separation is load-bearing, not incidental file-splitting.
 */
export interface AlertRow {
  id: string;
  zone_id: string;
  severity: AlertRecord["severity"];
  message: AlertRecord["message"];
  source: AlertRecord["source"];
  confidence: AlertRecord["confidence"];
  predicted_timing: AlertRecord["predictedTiming"] | null;
  issued_at: string;
  is_active: boolean;
  superseded_severity: AlertRecord["severity"] | null;
}

export function toAlertRecords(rows: AlertRow[]): AlertRecord[] {
  return rows.map((row) => ({
    id: row.id,
    zoneId: row.zone_id,
    severity: row.severity,
    message: row.message,
    source: row.source,
    confidence: row.confidence,
    predictedTiming: row.predicted_timing ?? undefined,
    issuedAt: row.issued_at,
    isActive: row.is_active,
  }));
}
