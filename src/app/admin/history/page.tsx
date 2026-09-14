import { loadOfficial } from "@/lib/auth/load-official";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseUserClient } from "@/lib/supabase/user-server";
import { toOfficialActions, filterToArea } from "@/lib/official-actions-mapper";
import { HistoryList } from "@/features/admin/history-list";

/**
 * Every recorded action across the system, newest first, opening filtered to
 * the official's own area with a link to see every area (design spec,
 * "History"). A server component: the /admin layout has already gated this
 * request to a signed-in, appointed official, so this page can safely query
 * official_actions with the USER client (RLS applies) rather than fetching
 * through the API route the way LastChangeLine does.
 *
 * Rendering itself is delegated to <HistoryList>, a "use client" component —
 * describeAction's localized sentence and each row's local time both depend
 * on the live language selection, which only a Client Component can read.
 * Same split as /admin (-> AdminOverview) and /sign-in (-> SignInPanel).
 */
export default async function HistoryPage({ searchParams }: PageProps<"/admin/history">) {
  const params = await searchParams;
  const rawScope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
  const scope = rawScope === "all" ? "all" : "mine";

  const gate = await loadOfficial();
  const official = gate.state === "official" ? gate.official : null;

  const { data: zoneRows } = await createSupabaseServerClient()
    .from("zones")
    .select("id, name, psgc_barangay_code");
  const zones = (zoneRows ?? []).map((zone) => ({
    id: zone.id,
    name: zone.name,
    psgcBarangayCode: zone.psgc_barangay_code,
  }));

  const supabase = await createSupabaseUserClient();
  const { data } = await supabase
    .from("official_actions")
    .select("id, occurred_at, actor_name, actor_area, action, zone_id, target_id, detail")
    .order("occurred_at", { ascending: false })
    .limit(200);

  // `detail` is a `jsonb not null default '{}'` column, which postgrest-js
  // renders as the broader `Json` type. Narrowed to the object shape the
  // column always holds at runtime, same as /api/official-actions.
  const rows = (data ?? []).map((row) => ({ ...row, detail: row.detail as Record<string, unknown> }));
  const allActions = toOfficialActions(rows);
  // Appointment/removal entries carry no zone_id, so filterToArea always
  // drops them — "My area" is barangay-and-town operations only; they
  // appear exclusively under "All areas" (design spec, "History").
  const actions = scope === "mine" && official ? filterToArea(allActions, zones, official.areaCode) : allActions;

  return <HistoryList actions={actions} zones={zones} scope={scope} />;
}
