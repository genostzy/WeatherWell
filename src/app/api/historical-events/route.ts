import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HistoricalEvent } from "@/lib/types";

const NO_STORE = { "Cache-Control": "no-store" };
/** Matches the viewport marker cap's own ceiling (viewport-tracker.tsx) — this is a supplementary overlay, not the safety-critical zone list. */
const MAX_ZONE_IDS = 500;

interface HistoricalEventRow {
  id: string;
  zone_id: string;
  hazard_type: string;
  event_date: string;
  severity: string;
  description: { en: string; fil: string };
  source: string | null;
}

/**
 * GET /api/historical-events?zoneIds=zone-1,zone-2
 *
 * The historical-events overlay layer, scoped to whichever zones are
 * currently on screen (the caller passes its own viewport-culled list —
 * see HazardBackdropLayer's own zones prop for the same pattern). Public
 * table (RLS: `select using (true)`), so the publishable-key client is
 * enough; there is no write path here at all — see the migration's own
 * comment on why.
 */
export async function GET(request: NextRequest) {
  const zoneIdsParam = request.nextUrl.searchParams.get("zoneIds");
  if (!zoneIdsParam) {
    return NextResponse.json({ events: [] }, { headers: NO_STORE });
  }

  const zoneIds = zoneIdsParam.split(",").filter(Boolean).slice(0, MAX_ZONE_IDS);
  if (zoneIds.length === 0) {
    return NextResponse.json({ events: [] }, { headers: NO_STORE });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("historical_events")
    .select("id, zone_id, hazard_type, event_date, severity, description, source")
    .in("zone_id", zoneIds)
    .order("event_date", { ascending: false })
    .returns<HistoricalEventRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502, headers: NO_STORE });
  }

  const events: HistoricalEvent[] = (data ?? []).map((row) => ({
    id: row.id,
    zoneId: row.zone_id,
    hazardType: row.hazard_type as HistoricalEvent["hazardType"],
    eventDate: row.event_date,
    severity: row.severity as HistoricalEvent["severity"],
    description: row.description,
    source: row.source,
  }));

  return NextResponse.json({ events }, { headers: NO_STORE });
}
