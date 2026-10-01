-- Residents' data rights (docs/superpowers/specs/2026-09-29-residents-data-rights-design.md).
-- A resident downloads what WeatherWell holds about them (/api/my-data) and
-- deletes it. Deleting keeps their water-level reports, anonymised, since
-- they are part of the barangay's flood record, and their pins, detached;
-- everything else goes, and the deleteMyData action then deletes the pins'
-- photos and the account itself (which removes the profile, push and email
-- alert subscriptions and security answers by their foreign keys).

alter table public.water_level_reports alter column reporter_id drop not null;
alter table public.community_pins alter column author_id drop not null;

-- The positions of the caller's own reports, which RLS keeps from every
-- resident (20260923082122_hide_report_locations), for the download.
create or replace function public.my_report_positions()
returns table (id uuid, lat double precision, lng double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.lat, r.lng
    from public.water_level_reports r
   where r.reporter_id = (select auth.uid())
$$;
revoke execute on function public.my_report_positions() from public, anon;
grant execute on function public.my_report_positions() to authenticated;

-- One transaction: reports lose who and where (located follows lat and lng,
-- so the engine stops counting them); pins lose their author and photo;
-- votes, check-ins, recovery attempts and rate-limit counts go. Returns the
-- photo paths for the action to delete from storage. A second call finds
-- nothing and returns an empty array. Officials and the admin are refused:
-- their records are the town's.
create or replace function public.delete_my_data()
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_paths text[];
begin
  if v_uid is null
     or exists (select 1 from public.profiles p where p.id = v_uid and p.role in ('operator', 'admin')) then
    raise exception using errcode = '42501', message = 'Only a resident can delete their data here.';
  end if;

  update public.water_level_reports
     set reporter_id = null, lat = null, lng = null
   where reporter_id = v_uid;

  select coalesce(array_agg(c.photo_path order by c.created_at), '{}')
    into v_paths
    from public.community_pins c
   where c.author_id = v_uid and c.photo_path is not null;
  update public.community_pins
     set author_id = null, photo_path = null
   where author_id = v_uid;

  delete from public.pin_votes where voter_id = v_uid;
  delete from public.evacuation_check_ins where user_id = v_uid;
  select u.email into v_email from auth.users u where u.id = v_uid;
  if v_email is not null then
    delete from private.recovery_attempts where lower(email) = lower(v_email);
  end if;
  delete from private.rate_limit_counts where key like '%' || v_uid::text || '%';
  return v_paths;
end $$;
revoke execute on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
