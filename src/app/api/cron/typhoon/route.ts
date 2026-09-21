import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseBulletinHtml, categoryLabel, BulletinParseError, type ParsedBulletin } from "@/lib/pagasa-parser";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const BULLETIN_URL =
  "https://bagong.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin";
const USER_AGENT = "WeatherWell/1.0 (+https://weatherwell.app) pnginsikayan";
const FETCH_TIMEOUT = 15_000;

function maxSignalLevel(bulletin: ParsedBulletin): number {
  if (bulletin.signals.length === 0) return 0;
  return Math.max(...bulletin.signals.map((s) => s.signalLevel));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>;

/**
 * GET /api/cron/typhoon
 *
 * Cron-triggered endpoint. Fetches the PAGASA severe weather bulletin,
 * parses cyclone data, and stores in typhoon_tracks.
 * Runs daily on Hobby plan.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const log: string[] = [];
  const logMsg = (msg: string) => { log.push(msg); };

  try {
    logMsg(`Typhoon ingestion started at ${new Date().toISOString()}`);

    const res = await fetch(BULLETIN_URL, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      redirect: "follow",
    });

    if (!res.ok) {
      logMsg(`Bulletin fetch failed: HTTP ${res.status}`);
      return NextResponse.json({ ok: false, log, error: `HTTP ${res.status}` });
    }

    const html = await res.text();
    if (html.length < 500) {
      logMsg("Bulletin HTML too short — likely no active cyclone");
      await deactivateAll(supabase, log);
      return NextResponse.json({ ok: true, log, action: "deactivated_all" });
    }

    let bulletin: ParsedBulletin | null;
    try {
      bulletin = parseBulletinHtml(html);
    } catch (e) {
      // A BulletinParseError means PAGASA's page structure changed — not
      // that there's an active cyclone we failed to store. Falling through
      // to the generic catch below would return HTTP 500 without touching
      // typhoon_tracks, leaving yesterday's (possibly long-resolved) system
      // marked active indefinitely. Treat it the same as "no active
      // cyclone": clear it, and surface the parse failure in the log so
      // it's visible without silently claiming a real system is active.
      if (e instanceof BulletinParseError) {
        logMsg(`Bulletin parse failed (page structure may have changed): ${e.message}`);
        await deactivateAll(supabase, log);
        return NextResponse.json({ ok: true, log, action: "deactivated_all", parseError: e.message });
      }
      throw e;
    }
    if (!bulletin) {
      logMsg("No active tropical cyclone detected");
      await deactivateAll(supabase, log);
      return NextResponse.json({ ok: true, log, action: "deactivated_all" });
    }

    logMsg(`Parsed: ${bulletin.pagasaName} (${bulletin.categoryRaw})`);
    logMsg(`  Bulletin #${bulletin.bulletinNumber}${bulletin.isFinal ? " (FINAL)" : ""}`);

    await storeBulletin(supabase, bulletin, log);

    return NextResponse.json({ ok: true, log, name: bulletin.pagasaName });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logMsg(`Fatal: ${msg}`);
    return NextResponse.json({ ok: false, log, error: msg }, { status: 500 });
  }
}

async function deactivateAll(
  supabase: SupabaseClient,
  log: string[]
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("typhoon_tracks")
    .update({ is_active: false })
    .eq("is_active", true);
  if (error) {
    log.push(`Deactivate error: ${error.message}`);
  } else {
    log.push("Deactivated previous tracks");
  }
}

async function storeBulletin(
  supabase: SupabaseClient,
  bulletin: ParsedBulletin,
  log: string[]
): Promise<void> {
  const trackRecord = {
    name: bulletin.pagasaName,
    international_name: bulletin.internationalName,
    category: categoryLabel(bulletin.category),
    positions: bulletin.center
      ? [
          {
            lat: bulletin.center.lat,
            lng: bulletin.center.lng,
            description: bulletin.center.description,
            outsidePar: bulletin.center.outsidePar,
            maxWindsKph: bulletin.maxWindsKph,
            gustinessKph: bulletin.gustinessKph,
            pressureHpa: bulletin.pressureHpa,
            movement: {
              direction: bulletin.movementDirection,
              speedKph: bulletin.movementSpeedKph,
            },
            time: bulletin.issuedAt,
          },
        ]
      : [],
    bulletin_number: bulletin.bulletinNumber,
    is_final: bulletin.isFinal,
    issued_at: bulletin.issuedAt,
    next_bulletin_at: bulletin.nextBulletinAt,
    headline: bulletin.headline,
    max_winds_kph: bulletin.maxWindsKph,
    gustiness_kph: bulletin.gustinessKph,
    pressure_hpa: bulletin.pressureHpa,
    movement_direction: bulletin.movementDirection,
    movement_speed_kph: bulletin.movementSpeedKph,
    wind_signal: maxSignalLevel(bulletin),
    signals: bulletin.signals,
    source: bulletin.source,
    is_active: true,
    fetched_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("typhoon_tracks")
    .select("id")
    .eq("is_active", true)
    .eq("name", bulletin.pagasaName)
    .limit(1)
    .single();

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("typhoon_tracks")
      .update(trackRecord)
      .eq("id", existing.id);
    if (error) {
      log.push(`Update error: ${error.message}`);
    } else {
      log.push(`Updated: ${bulletin.pagasaName} bulletin #${bulletin.bulletinNumber}`);
    }
  } else {
    // Deactivate all previous systems
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("typhoon_tracks")
      .update({ is_active: false })
      .eq("is_active", true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("typhoon_tracks")
      .insert(trackRecord);
    if (error) {
      log.push(`Insert error: ${error.message}`);
    } else {
      log.push(`Inserted: ${bulletin.pagasaName} bulletin #${bulletin.bulletinNumber}`);
    }
  }
}
