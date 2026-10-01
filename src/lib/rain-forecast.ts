import "server-only";
import { createClient } from "@supabase/supabase-js";
import { heavyRainAhead } from "@/lib/open-meteo";
import { notifyResidentsOfAlertChange } from "@/lib/notify-residents";
import type { LocalizedText } from "@/lib/types";

const service = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** The hour, in Philippine time: "3 PM". */
const hourOf = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { hour: "numeric", timeZone: "Asia/Manila" }).format(new Date(iso));

/** A Forecast advisory's words, and the "Expected" line under it. */
export function forecastAdvisoryCopy(startsAt: string, peakMm: number): { message: LocalizedText; timing: LocalizedText } {
  const hour = hourOf(startsAt);
  const mm = Math.round(peakMm);
  return {
    message: {
      en: `Forecast advisory — heavy rain expected from about ${hour} (up to ${mm} mm in an hour, Open-Meteo forecast). Prepare now; this is a forecast, not a report.`,
      fil: `Paalala mula sa forecast — inaasahan ang malakas na ulan mula bandang ${hour} (hanggang ${mm} mm sa isang oras, ayon sa forecast ng Open-Meteo). Maghanda na; forecast ito, hindi ulat.`,
    },
    timing: { en: `From about ${hour}`, fil: `Mula bandang ${hour}` },
  };
}

interface HourlyReply {
  hourly?: { time?: string[]; precipitation?: (number | null)[] };
}

const HOUR_MS = 60 * 60 * 1000;

/** Open-Meteo answers in UTC without a zone ("2026-10-01T07:00"); made a full ISO time. */
const utc = (time: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(time) ? time : `${time}Z`).toISOString();

/**
 * One hourly run of the rain heads-up: every barangay in a town with an
 * appointed official, one Open-Meteo request for all of them, then
 * set_forecast_advisory per barangay. Residents hear only of a new advisory.
 * Throws when Open-Meteo fails (nothing is changed) or when the database
 * refused any barangay (after trying the rest), so the workflow run fails.
 */
export async function runRainForecast(): Promise<{ checked: number; raised: string[]; ended: number }> {
  const supabase = service();
  const { data: officials, error: officialsError } = await supabase
    .from("profiles")
    .select("area_code")
    .eq("role", "operator");
  if (officialsError) throw new Error(officialsError.message);
  const towns = [
    ...new Set(
      (officials ?? [])
        .map((o) => (o.area_code as string | null)?.slice(0, 7))
        .filter((code): code is string => !!code && /^\d{7}$/.test(code))
    ),
  ];
  if (towns.length === 0) return { checked: 0, raised: [], ended: 0 };

  const { data: zones, error: zonesError } = await supabase
    .from("zones")
    .select("id, lat, lng")
    .or(towns.map((town) => `psgc_barangay_code.like.${town}*`).join(","));
  if (zonesError) throw new Error(zonesError.message);
  const list = (zones ?? []) as { id: string; lat: number; lng: number }[];
  if (list.length === 0) return { checked: 0, raised: [], ended: 0 };

  const params = new URLSearchParams({
    latitude: list.map((z) => z.lat).join(","),
    longitude: list.map((z) => z.lng).join(","),
    hourly: "precipitation",
    // The first stamp is the hour already under way (its total is the hour before it), so 7 give the next 6.
    forecast_hours: "7",
    timezone: "UTC",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  const body = (await res.json()) as HourlyReply | HourlyReply[];
  // One location comes back as an object, several as a list in the order asked.
  const replies = Array.isArray(body) ? body : [body];
  if (replies.length !== list.length) throw new Error(`Open-Meteo answered ${replies.length} of ${list.length} places`);

  const now = Date.now();
  const raised: string[] = [];
  let ended = 0;
  let firstError: string | undefined;
  for (const [i, zone] of list.entries()) {
    const hourly = replies[i]?.hourly;
    // Each stamp closes the hour it totals: only hours still to end count, and rain stamped 3 PM
    // starts falling at 2 PM.
    const times = (hourly?.time ?? []).map(utc);
    const ahead = times.flatMap((time, h) => (Date.parse(time) > now ? [h] : []));
    const found = heavyRainAhead(
      ahead.map((h) => times[h]),
      ahead.map((h) => hourly?.precipitation?.[h] ?? null)
    );
    const heavy = found && { ...found, startsAt: new Date(Date.parse(found.startsAt) - HOUR_MS).toISOString() };
    const copy = heavy ? forecastAdvisoryCopy(heavy.startsAt, heavy.peakMm) : null;
    const { data, error } = await supabase.rpc("set_forecast_advisory", {
      p_zone_id: zone.id,
      // The generated types cannot say null; the function's null start is how it ends one.
      p_starts_at: (heavy?.startsAt ?? null) as string,
      p_peak_at: (heavy?.peakAt ?? null) as string,
      p_peak_mm: (heavy?.peakMm ?? null) as number,
      p_message: copy?.message ?? null,
      p_timing: copy?.timing ?? null,
    });
    if (error) {
      firstError ??= error.message;
      continue;
    }
    if (data === "raised") {
      raised.push(zone.id);
      await notifyResidentsOfAlertChange(zone.id, "set");
    } else if (data === "ended") {
      ended++;
    }
  }
  if (firstError) throw new Error(firstError);
  return { checked: list.length, raised, ended };
}
