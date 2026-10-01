-- The plan D review (1 October) on residents' data rights.
--
-- 1. delete_my_data hands back every photo in the resident's own folder, not
--    only those attached to a pin: an upload whose attach failed, or one a
--    failed storage delete left behind, is theirs too and goes now (a retry
--    finds whatever is still there).
-- 2. attach_pin_photo refused only when the pin's author differed from the
--    caller, and a detached pin's NULL author compares as NULL, never as
--    different: any resident could attach a photo to it. A missing author now
--    refuses like anyone else's.
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

  -- Every photo in their folder (the upload policy keeps uploads there), attached or not.
  select coalesce(array_agg(o.name order by o.created_at), '{}')
    into v_paths
    from storage.objects o
   where o.bucket_id = 'pin-photos'
     and (storage.foldername(o.name))[1] = v_uid::text;
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

create or replace function public.attach_pin_photo(p_pin_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_pin record;
begin
  select p.author_id, p.removed into v_pin from public.community_pins p where p.id = p_pin_id;
  if not found or v_uid is null or v_pin.author_id::text is distinct from v_uid then
    raise exception using errcode = '42501', message = 'not your pin';
  end if;
  if v_pin.removed then
    raise exception using errcode = '22023', message = 'the pin is removed';
  end if;
  if p_path is null or p_path !~ ('^' || v_uid || '/[^/]+$') or position('..' in p_path) > 0 then
    raise exception using errcode = '22023', message = 'the photo is not in your folder';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'pin-photos' and o.name = p_path) then
    raise exception using errcode = '22023', message = 'no such photo';
  end if;
  update public.community_pins set photo_path = p_path where id = p_pin_id;
end $$;
revoke all on function public.attach_pin_photo(uuid, text) from public, anon;
grant execute on function public.attach_pin_photo(uuid, text) to authenticated;
