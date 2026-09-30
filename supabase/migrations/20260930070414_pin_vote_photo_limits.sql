-- Limits for pins, votes and photos (docs/superpowers/specs/2026-09-29-pin-vote-photo-limits-design.md).
-- Reports have had a geofence and a rate limit since 20260922094703; pins and
-- votes had neither, and photo uploads had no cap per account. Refusals carry
-- hints, as reports' do: 'too_far' (23514, permanent) and 'rate_limited'
-- (P0001, which the outbox retries).

-- A pin must be within 15 km of its barangay's point, like a report, and one
-- account places 5 pins an hour. Officials are not counted: their pins are
-- part of their work. The count runs on the database's clock
-- (take_rate_limit), so a phone's time cannot dodge it, and a refused or
-- duplicate pin rolls its count back with the rest of the statement.
create or replace function private.enforce_pin_geofence_and_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_zone_lat double precision;
  v_zone_lng double precision;
begin
  select z.lat, z.lng into v_zone_lat, v_zone_lng from public.zones z where z.id = new.zone_id;
  -- An unusable distance (a NaN or infinite position) counts as too far, never as near.
  if v_zone_lat is not null and not (
    111320 * sqrt(
      power(new.lat - v_zone_lat, 2) +
      power((new.lng - v_zone_lng) * cos(radians(v_zone_lat)), 2)
    ) <= 15000
  ) then
    raise exception 'This spot is more than 15 km from the barangay it is pinned in.'
      using errcode = '23514', hint = 'too_far';
  end if;

  if not private.is_operator() and not public.take_rate_limit('pin:' || new.author_id, 5, 3600) then
    raise exception 'Too many pins from this account this hour.' using hint = 'rate_limited';
  end if;
  return new;
end $$;
revoke execute on function private.enforce_pin_geofence_and_rate_limit() from public, anon, authenticated;

create trigger community_pins_geofence_and_rate_limit
  before insert on public.community_pins
  for each row execute function private.enforce_pin_geofence_and_rate_limit();

-- One account casts 30 votes an hour. voteOnPin always upserts, and an
-- insert ... on conflict do update fires this insert trigger once even when it
-- becomes an update, so a change of mind counts once. It runs before the
-- net-score removal (an after trigger), so a refused vote takes nothing down.
create or replace function private.enforce_vote_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.take_rate_limit('vote:' || new.voter_id, 30, 3600) then
    raise exception 'Too many votes from this account this hour.' using hint = 'rate_limited';
  end if;
  return new;
end $$;
revoke execute on function private.enforce_vote_rate_limit() from public, anon, authenticated;

create trigger pin_votes_rate_limit
  before insert on public.pin_votes
  for each row execute function private.enforce_vote_rate_limit();

-- The caller's own photo uploads in the last day. The upload policy runs as
-- the uploader, who cannot read pin-photos rows (only officials can), so a
-- count written into the policy would always see none. This definer function
-- counts them, and only the caller's own, so it tells nobody about anyone else.
create or replace function private.my_photo_uploads_today() returns int
language sql security definer stable set search_path = '' as $$
  select count(*)::int
    from storage.objects o
   where o.bucket_id = 'pin-photos'
     and o.owner_id = (select auth.uid())::text
     and o.created_at > now() - interval '1 day'
$$;
revoke execute on function private.my_photo_uploads_today() from public, anon;
grant execute on function private.my_photo_uploads_today() to authenticated;

-- Ten photo uploads a day from one account, on top of uploading only into
-- one's own folder (20260928132821_pin_types_and_photos).
drop policy pin_photos_insert_own on storage.objects;
create policy pin_photos_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pin-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.my_photo_uploads_today()) < 10
  );
