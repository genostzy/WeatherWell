import { NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";

export const dynamic = "force-dynamic";

/** What /api/my-data hands back: everything WeatherWell holds about the signed-in resident. */
export interface MyData {
  exportedAt: string;
  account: { id: string; createdAt: string; anonymous: boolean; email: string | null };
  /** The resident's saved barangay (profiles.zone_id). */
  barangay: string | null;
  reports: { id: string; zoneId: string; depthLevel: string; reportedAt: string; lat: number | null; lng: number | null }[];
  pins: { id: string; zoneId: string; statusTag: string; caption: string; lat: number; lng: number; createdAt: string; hadPhoto: boolean }[];
  votes: { pinId: string; direction: number; votedAt: string }[];
  checkIns: { zoneId: string; status: string; checkedInAt: string }[];
  alerts: { push: { zoneId: string; since: string }[]; email: { zoneId: string | null; since: string }[] };
  securityQuestions: string[];
}

/**
 * GET /api/my-data
 *
 * The signed-in resident's own data, as a JSON file to download (Settings,
 * "Download my data"). Read with their session, so RLS keeps it to their own
 * rows, and each table is also filtered by their id. Report positions, which
 * RLS hides from residents, come from my_report_positions. Never the push
 * keys, the email unsubscribe token or the security answers.
 */
export async function GET() {
  const supabase = await createSupabaseUserClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "Sign in to download your data." }, { status: 401 });
  const me = user.id;

  const [profile, pins, votes, checkIns, push, email, reports, positions, questions] = await Promise.all([
    supabase.from("profiles").select("zone_id").eq("id", me),
    supabase.from("community_pins").select("id, zone_id, status_tag, caption, lat, lng, created_at, photo_path").eq("author_id", me),
    supabase.from("pin_votes").select("pin_id, direction, voted_at").eq("voter_id", me),
    supabase.from("evacuation_check_ins").select("zone_id, status, checked_in_at").eq("user_id", me),
    supabase.from("push_subscriptions").select("zone_id, created_at").eq("user_id", me),
    supabase.from("email_alert_subscriptions").select("zone_id, created_at").eq("user_id", me),
    supabase.rpc("my_water_level_reports"),
    supabase.rpc("my_report_positions"),
    supabase.rpc("my_recovery_questions"),
  ]);
  const failed = [profile, pins, votes, checkIns, push, email, reports, positions, questions].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 502 });

  const where = new Map((positions.data ?? []).map((p) => [p.id, p]));
  const body: MyData = {
    exportedAt: new Date().toISOString(),
    account: { id: me, createdAt: user.created_at, anonymous: user.is_anonymous ?? false, email: user.email ?? null },
    barangay: profile.data?.[0]?.zone_id ?? null,
    reports: (reports.data ?? []).map((r) => ({
      id: r.id,
      zoneId: r.zone_id,
      depthLevel: r.depth_level,
      reportedAt: r.reported_at,
      lat: where.get(r.id)?.lat ?? null,
      lng: where.get(r.id)?.lng ?? null,
    })),
    pins: (pins.data ?? []).map((p) => ({
      id: p.id,
      zoneId: p.zone_id,
      statusTag: p.status_tag,
      caption: p.caption,
      lat: p.lat,
      lng: p.lng,
      createdAt: p.created_at,
      hadPhoto: p.photo_path !== null,
    })),
    votes: (votes.data ?? []).map((v) => ({ pinId: v.pin_id, direction: v.direction, votedAt: v.voted_at })),
    checkIns: (checkIns.data ?? []).map((c) => ({ zoneId: c.zone_id, status: c.status, checkedInAt: c.checked_in_at })),
    alerts: {
      push: (push.data ?? []).map((s) => ({ zoneId: s.zone_id, since: s.created_at })),
      email: (email.data ?? []).map((s) => ({ zoneId: s.zone_id, since: s.created_at })),
    },
    securityQuestions: (questions.data ?? []).flatMap((q) => [q.question_1, q.question_2]),
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="weatherwell-my-data.json"',
      "Cache-Control": "no-store",
    },
  });
}
