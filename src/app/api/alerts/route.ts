import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toAlertRecords } from "@/lib/alerts-mapper";
import type { AlertRecord } from "@/lib/types";

/**
 * Active alerts, plus alerts superseded within the downgrade window, so a
 * later plan can tell residents an alert was lifted rather than letting it
 * vanish. Six hours: long enough to cover someone who slept through the
 * change, short enough that it still reads as news.
 */
const DOWNGRADE_WINDOW_HOURS = 6;

export async function GET() {
  const supabase = createSupabaseServerClient();
  const since = new Date(Date.now() - DOWNGRADE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("alerts")
    .select(
      "id, zone_id, severity, message, source, confidence, predicted_timing, issued_at, is_active, superseded_severity"
    )
    .or(`is_active.eq.true,superseded_at.gte.${since}`)
    .order("issued_at", { ascending: false });

  if (error) {
    // Never 200 with an empty list on failure — "no alerts" is the single most
    // dangerous wrong answer this system can give.
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  // `severity`, `source` and `confidence` are CHECK-constrained `text` columns
  // rather than Postgres enums, and `message`/`predicted_timing` are `jsonb`, so
  // the generated types render them as `string`/`Json`. Each assertion below
  // narrows exactly one such field to the literal union or LocalizedText shape
  // the CHECK constraint (or the app's own writer) already guarantees at
  // runtime — no whole-result cast, same pattern as /api/zones.
  const alerts = data.map((row) => ({
    ...row,
    severity: row.severity as AlertRecord["severity"],
    source: row.source as AlertRecord["source"],
    confidence: row.confidence as AlertRecord["confidence"],
    message: row.message as AlertRecord["message"],
    predicted_timing: row.predicted_timing as AlertRecord["predictedTiming"] | null,
    // Narrowed here for the same reason severity/source/confidence/message
    // are: a CHECK-constrained text column the generated types render as
    // `string`. toAlertRecords (alerts-mapper.ts) maps this onto
    // AlertRecord.supersededSeverity, which layer 9 reads to explain a
    // downgrade without a join or a history walk.
    superseded_severity: row.superseded_severity as AlertRecord["severity"] | null,
  }));

  return NextResponse.json(toAlertRecords(alerts));
}
