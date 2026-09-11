-- 1. An official's area and name live on their profile, set only by the
--    appointment commands (Task 3). Clients have no write grant on profiles.
alter table public.profiles
  add column area_code    text check (area_code ~ '^(\d{7}|\d{10})$'),
  add column display_name text;

alter table public.profiles
  add constraint operator_has_area_and_name
  check (role <> 'operator' or (area_code is not null and display_name is not null));

-- 2. Town names, so the appointment command accepts "Mapandan" not a code.
create table public.municipalities (
  code text primary key check (code ~ '^\d{7}$'),
  name text not null
);
alter table public.municipalities enable row level security;
revoke insert, update, delete, truncate on public.municipalities from anon, authenticated;
grant select on public.municipalities to anon, authenticated;
create policy municipalities_read on public.municipalities
  for select to anon, authenticated using (true);

-- 3. The one rule. `language sql`, never plpgsql (see Global Constraints).
--    area_code is digits only (the check above), so LIKE sees no wildcards.
create or replace function private.manages_zone(p_zone_id text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.zones z on z.id = p_zone_id
    where p.id = (select auth.uid())
      and p.role = 'operator'
      and z.psgc_barangay_code like p.area_code || '%'
  );
$$;
revoke execute on function private.manages_zone(text) from public, anon;
grant  execute on function private.manages_zone(text) to authenticated;

-- 4. Every policy that authorises an action on a specific barangay.
--    manages_zone takes a row value, so it is called directly rather than
--    wrapped in (select …): the wrapper only helps functions that do not
--    depend on the row.
drop policy alerts_write_operator on public.alerts;
create policy alerts_insert_in_area on public.alerts
  for insert to authenticated
  with check (private.manages_zone(zone_id) and source = 'manual');

drop policy alerts_update_operator on public.alerts;
create policy alerts_update_in_area on public.alerts
  for update to authenticated
  using (private.manages_zone(zone_id))
  with check (private.manages_zone(zone_id));

drop policy centers_update_operator on public.evacuation_centers;
create policy centers_update_in_area on public.evacuation_centers
  for update to authenticated
  using (private.manages_zone(zone_id))
  with check (private.manages_zone(zone_id));

drop policy pins_update_own_or_operator on public.community_pins;
create policy pins_update_own_or_in_area on public.community_pins
  for update to authenticated
  using ((select auth.uid()) = author_id or private.manages_zone(zone_id))
  with check ((select auth.uid()) = author_id or private.manages_zone(zone_id));

drop policy checkins_read_own_or_operator on public.evacuation_check_ins;
create policy checkins_read_own_or_in_area on public.evacuation_check_ins
  for select to authenticated
  using ((select auth.uid()) = user_id or private.manages_zone(zone_id));

drop policy profiles_read_own_or_operator on public.profiles;
create policy profiles_read_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- 5. Only an official for THIS barangay may restore a pin or set its reason.
drop trigger pins_protect_moderation_columns on public.community_pins;
create trigger pins_protect_moderation_columns
  before update on public.community_pins
  for each row
  when (
    row_security_active('public.community_pins')
    and not private.manages_zone(new.zone_id)
    and ((old.removed and not new.removed)
         or (new.removed_reason is distinct from old.removed_reason))
  )
  execute function private.deny_pin_moderation_write();

create or replace function private.deny_pin_moderation_write()
  returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501',
    message = 'only an official for this barangay may restore a removed pin or set removed_reason';
end $$;

-- 6. One alert path for people and machines (spec: Built for V1).
--    Officials reach it through RLS, which pins their rows to 'manual'.
--    V1's engine calls it with the service role and its own source.
drop function public.set_zone_alert(text, text, jsonb);
create function public.set_zone_alert(
  p_zone_id  text,
  p_severity text,
  p_message  jsonb,
  p_source   text default 'manual'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_previous text;
begin
  update public.alerts
     set is_active = false, superseded_at = now()
   where zone_id = p_zone_id and is_active
  returning severity into v_previous;

  -- A clear by someone RLS filters out would otherwise be a silent no-op
  -- the caller reads as success. Alerts are world-readable, so the invoker
  -- can see that an active alert exists even when it may not change it.
  if p_severity is null and v_previous is null
     and exists (select 1 from public.alerts where zone_id = p_zone_id and is_active) then
    raise exception using errcode = '42501',
      message = 'not an official for this barangay';
  end if;

  if p_severity is not null then
    insert into public.alerts
      (zone_id, severity, message, source, confidence, superseded_severity)
    values
      (p_zone_id, p_severity, p_message, p_source,
       case when p_source = 'manual' then 'validated' else 'estimated' end,
       v_previous);
  end if;
end;
$$;
revoke execute on function public.set_zone_alert(text, text, jsonb, text) from public, anon;
grant  execute on function public.set_zone_alert(text, text, jsonb, text) to authenticated, service_role;
