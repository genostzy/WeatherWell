/**
 * Typhoon data ingestion script.
 *
 * Fetches PAGASA Severe Weather Bulletin, parses cyclone data and
 * wind signal areas, and stores in Supabase typhoon_tracks table.
 *
 * Usage: npx tsx scripts/fetch-typhoon.ts
 * Or: Vercel Cron Job → /api/cron/typhoon
 *
 * Data source: DOST-PAGASA (public domain, Republic Act No. 8293)
 * Parsing approach: Ported from BagyoAPI (MIT, edwardguevarra/bagyo-api)
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import {
  parseBulletinHtml,
  categoryLabel,
  BulletinParseError,
  type ParsedBulletin,
} from "../src/lib/pagasa-parser";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/** PAGASA severe weather bulletin page */
const BULLETIN_URL =
  "https://bagong.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin";

/** PAGASA TCB PDF repository */
const PDF_BASE_URL =
  "https://pubfiles.pagasa.dost.gov.ph/tamss/weather/bulletin";

/** PAGASA current advisory PDF (always latest) */
const ADVISORY_PDF_URL =
  "https://pubfiles.pagasa.dost.gov.ph/tamss/weather/tcadvisory.pdf";

const USER_AGENT = "WeatherWell/1.0 (+https://weatherwell.app) pnginsikayan";
const FETCH_TIMEOUT = 15_000;

interface FetchResult {
  ok: boolean;
  status: number;
  text: string;
}

async function fetchUrl(url: string): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, status: res.status, text: "" };
    const text = await res.text();
    return { ok: true, status: res.status, text };
  } catch (e) {
    console.error(`Fetch failed for ${url}:`, (e as Error).message);
    return { ok: false, status: 0, text: "" };
  }
}

/**
 * Compute the highest signal level from a bulletin.
 * Returns 0 when no signals are hoisted.
 */
function maxSignalLevel(bulletin: ParsedBulletin): number {
  if (bulletin.signals.length === 0) return 0;
  return Math.max(...bulletin.signals.map((s) => s.signalLevel));
}

/**
 * Store bulletin data in typhoon_tracks.
 * Deactivates previous active systems when a new one appears.
 */
async function storeBulletin(bulletin: ParsedBulletin): Promise<void> {
  const categoryLabel_ = categoryLabel(bulletin.category);

  // Build the track record
  const trackRecord = {
    name: bulletin.pagasaName,
    international_name: bulletin.internationalName,
    category: categoryLabel_,
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
    // New fields
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

  // Deactivate any previously active systems with the same name
  // (if a new bulletin arrives for the same storm, update rather than duplicate)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("typhoon_tracks")
    .select("id")
    .eq("is_active", true)
    .eq("name", bulletin.pagasaName)
    .limit(1)
    .single();

  if (existing) {
    // Update existing record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("typhoon_tracks")
      .update(trackRecord)
      .eq("id", existing.id);
    if (error) {
      console.error("Update error:", error.message);
    } else {
      console.log(
        `Updated track for ${bulletin.pagasaName} (bulletin #${bulletin.bulletinNumber})`
      );
    }
  } else {
    // Deactivate all previous systems
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("typhoon_tracks")
      .update({ is_active: false })
      .eq("is_active", true);

    // Insert new system
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("typhoon_tracks")
      .insert(trackRecord);
    if (error) {
      console.error("Insert error:", error.message);
    } else {
      console.log(
        `Inserted track for ${bulletin.pagasaName} (bulletin #${bulletin.bulletinNumber})`
      );
    }
  }

  // Log signal summary
  if (bulletin.signals.length > 0) {
    console.log(
      `  Signals: ${bulletin.signals
        .map((s) => `Signal ${s.signalLevel} (${s.areas.length} areas)`)
        .join(", ")}`
    );
  }
}

/**
 * Mark all active systems as inactive when no cyclone is present.
 */
async function deactivateAll(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("typhoon_tracks")
    .update({ is_active: false })
    .eq("is_active", true);
  if (error) {
    console.error("Deactivate error:", error.message);
  } else {
    console.log("No active tropical cyclone — deactivated previous tracks");
  }
}

async function main() {
  console.log("Starting typhoon data ingestion...");
  console.log(`Time: ${new Date().toISOString()}`);

  // Strategy 1: Try HTML bulletin page
  console.log("\n[1/3] Fetching HTML bulletin...");
  const htmlResult = await fetchUrl(BULLETIN_URL);

  if (htmlResult.ok && htmlResult.text.length > 500) {
    try {
      const bulletin = parseBulletinHtml(htmlResult.text);
      if (!bulletin) {
        console.log("No active tropical cyclone (HTML: clean state)");
        await deactivateAll();
        return;
      }
      console.log(
        `Parsed: ${bulletin.pagasaName} (${bulletin.categoryRaw})`
      );
      console.log(
        `  Bulletin #${bulletin.bulletinNumber}${bulletin.isFinal ? " (FINAL)" : ""}`
      );
      console.log(`  Issued: ${bulletin.issuedAt}`);
      if (bulletin.center) {
        console.log(
          `  Position: ${bulletin.center.lat}°N, ${bulletin.center.lng}°E`
        );
        if (bulletin.center.description)
          console.log(`  ${bulletin.center.description}`);
      }
      if (bulletin.maxWindsKph)
        console.log(`  Winds: ${bulletin.maxWindsKph} km/h`);
      if (bulletin.pressureHpa)
        console.log(`  Pressure: ${bulletin.pressureHpa} hPa`);

      await storeBulletin(bulletin);
      return;
    } catch (e) {
      if (e instanceof BulletinParseError) {
        console.warn(`HTML parse failed: ${e.message}`);
        console.warn("Falling back to PDF...");
      } else {
        throw e;
      }
    }
  } else {
    console.warn(
      `HTML fetch failed (status: ${htmlResult.status}), trying PDF...`
    );
  }

  // Strategy 2: Try the current advisory PDF
  console.log("\n[2/3] Fetching advisory PDF...");
  const pdfResult = await fetchUrl(ADVISORY_PDF_URL);

  if (pdfResult.ok && pdfResult.text.length > 100) {
    // pdfResult.text contains the raw PDF bytes — we need pdf-parse
    // For now, skip PDF parsing if we can't extract text
    console.warn(
      "PDF received but text extraction requires pdf-parse (not yet installed)"
    );
  }

  // Strategy 3: Try finding the latest numbered TCB
  console.log("\n[3/3] Checking TCB PDF directory...");
  const dirResult = await fetchUrl(`${PDF_BASE_URL}/`);

  if (dirResult.ok) {
    // Find the highest-numbered TCB PDF
    const pdfPattern = /TCB#(\d+)_(\w+)\.pdf/g;
    let match;
    let highestNum = 0;
    let latestPdf = "";
    while ((match = pdfPattern.exec(dirResult.text)) !== null) {
      const num = Number(match[1]);
      if (num > highestNum) {
        highestNum = num;
        latestPdf = `TCB#${match[1]}_${match[2]}.pdf`;
      }
    }
    if (latestPdf) {
      console.log(`Latest TCB: ${latestPdf}`);
      // PDF text extraction would go here
      console.warn(
        "PDF text extraction not yet available — skipping"
      );
    } else {
      console.log("No TCB PDFs found in directory");
    }
  }

  console.log("\nIngestion complete.");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
