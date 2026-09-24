-- Two tiers of local official, as in RA 10121: a barangay official (BDRRMC,
-- a 10-digit PSGC area) runs their barangay and its centre; a municipal
-- official (MDRRMO, a 7-digit town area) oversees every barangay in town.
--
-- 1. A municipal official appoints and removes the barangay officials in
--    their own town. Until now only an admin could, which left towns
--    waiting on one national account.
-- 2. Officials in a town send each other short updates: a barangay tells the
--    town "centre full" or "we need help" (up); the town tells every
--    barangay what is coming (down). Everyone appointed in the town reads
--    the town's updates, so a barangay also sees that its neighbour's centre
--    is full before sending people there.

-- The caller's town code if they are a municipal official, else null.
create or replace function private.my_town_code()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.area_code from public.profiles p
   where p.id = (select auth.uid()) and p.role = 'operator' and p.area_code ~ '^\d{7}$';
$$;

create or replace function public.town_appoint_barangay_official(p_email text, p_zone_id text, p_display_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_town text := private.my_town_code();
  v_code text;
  v_role text;
  v_area text;
begin
  if v_town is null then
    raise exception using errcode = '42501', message = 'only a municipal official may appoint barangay officials';
  end if;
  select z.psgc_barangay_code into v_code from public.zones z where z.id = p_zone_id;
  if v_code is null or v_code not like v_town || '%' then
    raise exception using errcode = '42501', message = 'That barangay is not in your town.';
  end if;
  -- Only a resident, or a barangay official already in this town, may be
  -- (re)assigned here; moving anyone else is an admin's call.
  select p.role, p.area_code into v_role, v_area
    from auth.users u join public.profiles p on p.id = u.id
   where lower(u.email) = lower(trim(p_email)) and not u.is_anonymous;
  if v_role = 'admin' or (v_role = 'operator' and not (v_area ~ '^\d{10}$' and v_area like v_town || '%')) then
    raise exception using errcode = '42501', message = 'That account is already an official for another area; only an admin can move it.';
  end if;
  return private.appoint_official(p_email, v_code, p_display_name);
end $$;

create or replace function public.town_remove_barangay_official(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_town  text := private.my_town_code();
  v_email text;
begin
  select u.email into v_email
    from auth.users u join public.profiles p on p.id = u.id
   where p.id = p_user_id and p.role = 'operator'
     and p.area_code ~ '^\d{10}$' and p.area_code like v_town || '%';
  if v_town is null or v_email is null then
    raise exception using errcode = '42501', message = 'Not a barangay official in your town.';
  end if;
  return private.remove_official(v_email);
end $$;

-- The barangay officials in the caller's town, for the town's own list.
-- Ids, not emails: removal is by id, and nobody needs the others' emails.
create or replace function public.town_officials()
returns table (user_id uuid, display_name text, area_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.area_code
    from public.profiles p
   where private.my_town_code() is not null
     and p.role = 'operator'
     and p.area_code ~ '^\d{10}$'
     and p.area_code like private.my_town_code() || '%'
   order by p.area_code;
$$;

create table public.official_messages (
  id uuid primary key default gen_random_uuid(),
  town_code text not null check (town_code ~ '^\d{7}$'),
  -- The sending barangay for an update going up; null for one from the town.
  zone_id text references public.zones (id) on delete cascade,
  direction text not null check (direction in ('up', 'down')),
  kind text not null check (kind in ('centre_full', 'need_help', 'all_clear', 'update')),
  body text not null default '' check (char_length(body) <= 500),
  sender_name text not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by_name text,
  check ((direction = 'up') = (zone_id is not null)),
  check (kind <> 'update' or char_length(body) > 0)
);

create index official_messages_town_created on public.official_messages (town_code, created_at desc);

alter table public.official_messages enable row level security;

create policy official_messages_read on public.official_messages
  for select to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.role = 'operator'
         and p.area_code like official_messages.town_code || '%'
    )
  );

revoke all on public.official_messages from anon, authenticated;
grant select on public.official_messages to authenticated;

create or replace function public.send_official_message(p_kind text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_area text;
  v_name text;
  v_zone text;
  v_id   uuid;
begin
  select p.area_code, p.display_name into v_area, v_name
    from public.profiles p where p.id = (select auth.uid()) and p.role = 'operator';
  if v_area ~ '^\d{10}$' then
    select z.id into v_zone from public.zones z where z.psgc_barangay_code = v_area;
    insert into public.official_messages (town_code, zone_id, direction, kind, body, sender_name)
    values (left(v_area, 7), v_zone, 'up', p_kind, btrim(coalesce(p_body, '')), coalesce(v_name, 'Barangay official'))
    returning id into v_id;
  elsif v_area ~ '^\d{7}$' then
    insert into public.official_messages (town_code, zone_id, direction, kind, body, sender_name)
    values (v_area, null, 'down', p_kind, btrim(coalesce(p_body, '')), coalesce(v_name, 'Municipal official'))
    returning id into v_id;
  else
    raise exception using errcode = '42501', message = 'only a barangay or municipal official can send updates';
  end if;
  return v_id;
end $$;

create or replace function public.acknowledge_official_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_town text := private.my_town_code();
begin
  update public.official_messages m
     set acknowledged_at = now(),
         acknowledged_by_name = (select p.display_name from public.profiles p where p.id = (select auth.uid()))
   where m.id = p_id and m.direction = 'up' and m.town_code = v_town and m.acknowledged_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'not an update your town can acknowledge';
  end if;
end $$;

revoke execute on function public.town_appoint_barangay_official(text, text, text) from public, anon;
revoke execute on function public.town_remove_barangay_official(uuid) from public, anon;
revoke execute on function public.town_officials() from public, anon;
revoke execute on function public.send_official_message(text, text) from public, anon;
revoke execute on function public.acknowledge_official_message(uuid) from public, anon;
grant execute on function public.town_appoint_barangay_official(text, text, text) to authenticated;
grant execute on function public.town_remove_barangay_official(uuid) to authenticated;
grant execute on function public.town_officials() to authenticated;
grant execute on function public.send_official_message(text, text) to authenticated;
grant execute on function public.acknowledge_official_message(uuid) to authenticated;
