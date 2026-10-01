-- The deferred findings of the 30 September - 1 October reviews.
--
-- 1. Officials are not held to the 10-photos-a-day limit, as their pins are
--    not held to the pin limit: documenting a flood is their work.
-- 2. The photo count goes by the uploader's folder (the upload policy keeps
--    every upload there), not by storage's owner column, which a client may
--    leave empty.
-- 3. The same vote cast again (an outbox replay, a second tap) spends
--    nothing; a new vote or a change of mind still counts.
-- 4. The cleanup gives an unattached upload three hours, not one, before it
--    deletes it: a pin waiting out the hourly limit still finds its photo.
-- 5. A resident reads back their own recovery attempts (the email and times
--    WeatherWell keeps for the password-reset limit), for the download.
create or replace function private.my_photo_uploads_today() returns int
language sql security definer stable set search_path = '' as $$
  select count(*)::int
    from storage.objects o
   where o.bucket_id = 'pin-photos'
     and (storage.foldername(o.name))[1] = (select auth.uid())::text
     and o.created_at > now() - interval '1 day'
$$;
revoke execute on function private.my_photo_uploads_today() from public, anon;
grant execute on function private.my_photo_uploads_today() to authenticated;

drop policy pin_photos_insert_own on storage.objects;
create policy pin_photos_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pin-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and ((select private.is_operator()) or (select private.my_photo_uploads_today()) < 10)
  );

create or replace function private.enforce_vote_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.pin_votes v
              where v.pin_id = new.pin_id and v.voter_id = new.voter_id and v.direction = new.direction) then
    return new;
  end if;
  if not public.take_rate_limit('vote:' || new.voter_id, 30, 3600) then
    raise exception 'Too many votes from this account this hour.' using hint = 'rate_limited';
  end if;
  return new;
end $$;
revoke execute on function private.enforce_vote_rate_limit() from public, anon, authenticated;

create or replace function public.pin_photos_to_delete()
returns table (path text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'pin-photos'
     and (o.created_at < now() - interval '7 days'
          or exists (select 1 from public.community_pins p where p.photo_path = o.name and p.removed)
          or (o.created_at < now() - interval '3 hours'
              and not exists (select 1 from public.community_pins p where p.photo_path = o.name)));
$$;
revoke all on function public.pin_photos_to_delete() from public, anon, authenticated;
grant execute on function public.pin_photos_to_delete() to service_role;

create or replace function public.my_recovery_attempts()
returns table (attempted_at timestamptz, succeeded boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.attempted_at, a.succeeded
    from private.recovery_attempts a
   where lower(a.email) = (select lower(u.email) from auth.users u where u.id = (select auth.uid()))
   order by a.attempted_at desc
$$;
revoke execute on function public.my_recovery_attempts() from public, anon;
grant execute on function public.my_recovery_attempts() to authenticated;
