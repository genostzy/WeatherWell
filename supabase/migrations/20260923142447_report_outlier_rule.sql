-- Corrects report_trust_weights' outlier rule before it could suppress a real
-- flood. Real reports from one barangay differ by two levels as a matter of
-- course (knee-deep uphill, neck-deep by the river); marking those outliers
-- dropped genuine flooding reports and blocked the advisory. Now:
--   * the consensus is taken from located reports only, the same reports
--     the engine counts;
--   * only a report three or more levels away is an outlier (dry against
--     waist/neck, ankle against neck): the kind of contradiction a false
--     report makes.

create or replace function private.score_water_level_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rank constant jsonb := '{"dry":0,"ankle":1,"knee":2,"waist":3,"neck":4}';
  v_weight numeric := 0.2;
  v_mode text;
  v_others int;
begin
  if new.reporter_id is not null then
    if exists (select 1 from public.evacuation_check_ins c
                where c.user_id = new.reporter_id and c.zone_id = new.zone_id) then
      v_weight := v_weight + 0.3;
    end if;
    if exists (select 1 from public.water_level_reports r
                where r.reporter_id = new.reporter_id and r.reported_at < now() - interval '24 hours') then
      v_weight := v_weight + 0.2;
    end if;
    if exists (
      select 1
        from public.water_level_reports mine
        join public.water_level_reports other
          on other.zone_id = mine.zone_id
         and other.reporter_id <> mine.reporter_id
         and other.reported_at between mine.reported_at - interval '1 hour' and mine.reported_at + interval '1 hour'
         and abs((v_rank ->> other.depth_level)::int - (v_rank ->> mine.depth_level)::int) <= 1
       where mine.reporter_id = new.reporter_id
         and mine.reported_at < now() - interval '1 hour'
    ) then
      v_weight := v_weight + 0.3;
    end if;
  end if;
  new.trust_weight := least(v_weight, 1.0);

  select mode() within group (order by r.depth_level), count(*)
    into v_mode, v_others
    from public.water_level_reports r
   where r.zone_id = new.zone_id
     and r.reported_at >= now() - interval '1 hour'
     and r.reporter_id is distinct from new.reporter_id
     and r.lat is not null and r.lng is not null
     and not r.is_outlier;
  new.is_outlier := v_others >= 2
    and abs((v_rank ->> new.depth_level)::int - (v_rank ->> v_mode)::int) >= 3;

  return new;
end $$;

revoke execute on function private.score_water_level_report() from public, anon, authenticated;
