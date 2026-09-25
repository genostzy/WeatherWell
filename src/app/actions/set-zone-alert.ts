"use server";

import { manualAlertMessage, SEVERITY_ORDER, type Severity } from "@/lib/severity";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import type { ActionResult } from "./action-result";

/**
 * getClaims, never getSession: it verifies the JWT signature against the
 * project's published keys. getSession does not revalidate and a spoofed
 * cookie would pass it.
 */
async function callerId(
  supabase: Awaited<ReturnType<typeof createSupabaseUserClient>>
): Promise<string | undefined> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub;
}

export interface SetZoneAlertInput {
  zoneId: string;
  /** "none" clears the zone's alert outright — the operator's all-clear. */
  severity: Severity | "none";
}

/**
 * An operator setting the alert a zone's residents actually see.
 *
 * **Does not go through the outbox, deliberately.** Every other write in
 * this app is a resident's, made on a phone possibly about to lose signal,
 * and must survive that loss — so it is queued and retried. This is an
 * operator's, made at a desk with a working connection, and it is a
 * *decision about current state* rather than an event to record. A queued
 * downgrade replayed forty minutes later would re-apply a decision the
 * situation has moved past, and worse, could silently reverse a newer
 * decision an operator made in the meantime (e.g. someone re-escalated after
 * this call was queued). There is no way to make "replay this stale
 * decision" safe, so instead this calls the database directly and reports
 * failure to the operator, who is looking at the current state and can
 * decide whether to retry.
 *
 * The database itself is the source of truth for what the new alert
 * replaced: `set_zone_alert` deactivates the zone's current active alert (if
 * any) and inserts the new one carrying `superseded_severity` in the same
 * transaction, closing the window a two-round-trip deactivate-then-insert
 * would leave for a concurrent write to collide with
 * `alerts_one_active_per_zone`.
 */
export async function setZoneAlert(input: SetZoneAlertInput): Promise<ActionResult> {
  if (input.severity !== "none" && !SEVERITY_ORDER.includes(input.severity)) {
    return { ok: false, permanent: true, error: `Unknown severity: ${input.severity}` };
  }

  const supabase = await createSupabaseUserClient();
  const userId = await callerId(supabase);
  if (!userId) {
    // Permanent, unlike every outbox-backed action's NO_SESSION. Those mark
    // a missing session transient because a queue will retry it later; this
    // action has no queue. Reporting it any other way would be a promise
    // this file cannot keep — the operator sees the failure now, while they
    // can still tell whether the call is still the right one, and retries by
    // hand.
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  // Copy written for one severity must never survive onto another. The
  // database enforces this structurally now: a new severity is always a new
  // row (set_zone_alert deactivates the old one rather than mutating it), and
  // a new row gets its own generated copy. This used to take careful
  // client-side reasoning (see the old genericOverrideMessage / keepsBaseSeverity
  // logic this replaced) — now it takes none, which is worth recording here
  // so nobody re-adds it.
  const severity = input.severity === "none" ? null : input.severity;
  const message = input.severity === "none" ? null : manualAlertMessage(input.severity);

  const { error } = await supabase.rpc("set_zone_alert", {
    p_zone_id: input.zoneId,
    // Postgres has no NOT NULL for function parameters, so the generated
    // Functions.Args type (database.types.ts) cannot know p_severity legally
    // accepts null — it always renders as `string`, never `string | null`.
    // The migration's own `p_severity text` and its `if p_severity is not
    // null` branch are the actual contract; this narrows only this one
    // value rather than casting the whole rpc call.
    p_severity: severity as string,
    p_message: message,
  });

  if (!error) return { ok: true };

  // Every code is permanent here, not just 42501 (an RLS denial). There is no
  // queue to retry into, so classifying anything transient would just be a
  // lie this action cannot back up with a later attempt — the honest answer
  // is always "tell the operator now".
  return { ok: false, permanent: true, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
}

/**
 * An official confirms the engine's automatic advisory (idea 4). Re-issued as
 * theirs with the same severity and what residents reported, "unverified"
 * swapped for "confirmed by your barangay". Read on the server rather than
 * sent by the page, so confirming can't change the words.
 */
export async function confirmAutomaticAlert(zoneId: string): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const userId = await callerId(supabase);
  if (!userId) {
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  const { data: alert, error: readError } = (await supabase
    .from("alerts")
    .select("severity, source, message")
    .eq("zone_id", zoneId)
    .eq("is_active", true)
    .maybeSingle()) as {
    data: { severity: string; source: string; message: { en: string; fil: string } } | null;
    error: { message: string } | null;
  };
  if (readError) return { ok: false, permanent: true, error: readError.message };
  if (!alert || alert.source !== "auto_crowdsourced") {
    return { ok: false, permanent: true, error: "There is no automatic advisory here to confirm." };
  }

  const { error } = await supabase.rpc("set_zone_alert", {
    p_zone_id: zoneId,
    p_severity: alert.severity,
    p_message: {
      en: alert.message.en.replace("(unverified)", "(confirmed by your barangay)"),
      fil: alert.message.fil.replace("(hindi pa kumpirmado)", "(kinumpirma ng inyong barangay)"),
    },
  });
  if (!error) return { ok: true };
  return { ok: false, permanent: true, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
}

/**
 * An official rejects the engine's automatic advisory as false. The database
 * clears it and records the verdict, and the devices whose reports raised it
 * stop counting toward automatic advisories (layer 6). An all-clear after
 * the water goes down is setZoneAlert with "none", which records no verdict.
 */
export async function rejectAutomaticAlert(zoneId: string): Promise<ActionResult> {
  const supabase = await createSupabaseUserClient();
  const userId = await callerId(supabase);
  if (!userId) {
    return { ok: false, permanent: true, error: "No session — sign in and try again." };
  }

  const { error } = await supabase.rpc("reject_automatic_alert", { p_zone_id: zoneId });
  if (!error) return { ok: true };
  return { ok: false, permanent: true, error: error.message ?? `Database error ${error.code ?? "(no code)"}` };
}

export interface SetZoneAlertsResult {
  sent: number;
  failed: number;
  /** The first database error, when any barangay failed. */
  error?: string;
}

/** A town is a few dozen barangays; this is a ceiling, not a target. */
const MAX_ZONES_AT_ONCE = 500;

/**
 * A municipal official alerting several barangays at once, in one call so
 * the page refreshes alerts once rather than once per barangay. Each
 * barangay still goes through set_zone_alert, so the database's own area
 * check decides each one.
 */
export async function setZoneAlerts(input: { zoneIds: string[]; severity: Severity }): Promise<SetZoneAlertsResult> {
  const zoneIds = [...new Set(input.zoneIds)].slice(0, MAX_ZONES_AT_ONCE);
  let sent = 0;
  let error: string | undefined;
  for (let i = 0; i < zoneIds.length; i += 10) {
    const results = await Promise.all(zoneIds.slice(i, i + 10).map((zoneId) => setZoneAlert({ zoneId, severity: input.severity })));
    for (const result of results) {
      if (result.ok) sent++;
      else error ??= result.error;
    }
  }
  return { sent, failed: zoneIds.length - sent, error };
}
