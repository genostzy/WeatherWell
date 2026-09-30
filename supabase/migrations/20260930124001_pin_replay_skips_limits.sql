-- A pin the outbox replays under an id already saved (its first answer was
-- lost) skips the geofence and the count, so the primary key answers 23505,
-- which createPin takes as delivered. Before this, a replay once the hour's
-- 5 pins had landed read as rate_limited and held the resident's own edits
-- behind a pin that was already on the map. Otherwise unchanged (20260930070414).
create or replace function private.enforce_pin_geofence_and_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_zone_lat double precision;
  v_zone_lng double precision;
begin
  if exists (select 1 from public.community_pins p where p.id = new.id) then
    return new;
  end if;

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
