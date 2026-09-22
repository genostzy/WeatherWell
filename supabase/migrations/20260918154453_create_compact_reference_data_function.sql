-- Recovered from the live project: this function exists on the database but
-- had no matching file in this directory, so `supabase db reset` (or any
-- fresh environment built from these migrations) would silently not have it.
-- Committing it as-is, not wiring it in — see get-reference-data-compact's
-- lack of callers; nothing in src/ references it yet.
create or replace function public.get_reference_data_compact()
 returns jsonb
 language plpgsql
 stable
as $function$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'zones', (
      select coalesce(jsonb_agg(row_to_json(z) order by z.id), '[]'::jsonb)
      from (
        select id, name, municipality_name, province_name, lat, lng
        from zones
        order by id
      ) z
    ),
    'hazards', (
      select coalesce(jsonb_agg(row_to_json(h) order by h.zone_id, h.hazard_type), '[]'::jsonb)
      from (
        select zone_id, hazard_type, risk_level
        from hazard_susceptibility
        order by zone_id, hazard_type
      ) h
    ),
    'pois', (
      select coalesce(jsonb_agg(row_to_json(p) order by p.id), '[]'::jsonb)
      from (
        select id, zone_id, category, name, lat, lng
        from points_of_interest
        order by id
      ) p
    )
  ) into result;

  return result;
end;
$function$
