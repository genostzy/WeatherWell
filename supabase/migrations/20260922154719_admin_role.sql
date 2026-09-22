-- Admin role: system-wide, above official. See
-- docs/superpowers/specs/2026-09-22-admin-role-and-password-auth-design.md
-- for the full reasoning; this migration is that design's Task 1.

-- 1. Widen the role check constraint. profiles_role_check is dropped and
--    re-added rather than altered in place — Postgres has no ALTER for a
--    CHECK constraint's condition.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('resident', 'operator', 'admin'));

-- 2. An admin needs a display_name for the action-record actor field,
--    exactly like an official already does — but never an area_code
--    (an admin is system-wide by definition; area_code stays NULL).
alter table public.profiles add constraint admin_has_name
  check (role <> 'admin' or display_name is not null);

-- 3. private.is_operator(): the coarse "is this person any kind of
--    official" check, used by every RLS policy that does not care WHICH
--    area — community pin moderation, check-in reads, official_actions
--    reads, official marker writes. An admin passes every one of these
--    for free the moment this one function does.
create or replace function private.is_operator() returns boolean
language sql security definer set search_path = '' stable
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('operator', 'admin')
  );
$$;

-- 4. private.manages_zone(p_zone_id): the fine-grained "is this person
--    the official for THIS zone" check behind alert writes, evacuation
--    centre updates, pin-moderation-column writes. An admin manages every
--    zone; the OR below is the entire mechanism, no area_code comparison
--    needed for the admin branch.
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
      and (
        (p.role = 'operator' and z.psgc_barangay_code like p.area_code || '%')
        or p.role = 'admin'
      )
  );
$$;

-- 5. record_official_action's actor lookup must recognise an admin's own
--    profile row too, or an admin-driven appointment falls through to
--    "Not an official" instead of the admin's real name.
create or replace function private.record_official_action(
  p_action         text,
  p_zone_id        text,
  p_target_id      text,
  p_detail         jsonb,
  p_actor_override text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_name text;
  v_area text;
begin
  if p_actor_override is not null then
    v_uid  := null;
    v_name := p_actor_override;
  elsif v_uid is null then
    v_name := 'System owner';
  else
    select display_name, area_code into v_name, v_area
      from public.profiles where id = v_uid and role in ('operator', 'admin');
    if v_name is null then v_name := 'Not an official'; end if;
  end if;

  insert into public.official_actions
    (actor_id, actor_name, actor_area, action, zone_id, target_id, detail)
  values
    (v_uid, v_name, v_area, p_action, p_zone_id, p_target_id, coalesce(p_detail, '{}'::jsonb));
end;
$$;

-- 6. appoint_official / remove_official: the ONLY change is the literal
--    'System owner' passed to record_official_action becomes NULL. Run
--    from the SQL editor (no auth.uid() in that context), NULL still
--    resolves to 'System owner' via record_official_action's own
--    v_uid is null branch above — unchanged behaviour for that path. Run
--    through the admin wrapper (a real authenticated session), auth.uid()
--    resolves to the calling admin, and the lookup just widened in step 5
--    finds and uses their name. Everything else about these two
--    functions, including their own lockdown, is untouched — this is
--    `create or replace` on the exact bodies already live, with one
--    string replaced.
create or replace function private.appoint_official(
  p_email        text,
  p_area         text,
  p_display_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid;
  v_name     text := trim(p_display_name);
  v_area     text := trim(p_area);
  v_code     text;
  v_label    text;
  v_count    int;
  v_matches  text;
  v_barangay text;
  v_town     text;
  v_covered  text;
begin
  if coalesce(v_name, '') = '' then
    raise exception 'A display name is required, e.g. ''Juan Dela Cruz, BDRRMO Nilombot''.';
  end if;

  select id into v_user from auth.users
   where lower(email) = lower(trim(p_email)) and not is_anonymous;
  if v_user is null then
    raise exception 'No account for %. Ask them to sign in once first.', p_email;
  end if;

  if not exists (select 1 from auth.users where id = v_user and email_confirmed_at is not null) then
    raise exception 'The account for % has not confirmed its email yet. Ask them to finish signing in (open the emailed link, or complete Google sign-in), then try again.', p_email;
  end if;

  if v_area ~ '^(\d{7}|\d{10})$' then
    v_code  := v_area;
    v_label := v_area;
  elsif position(',' in v_area) > 0 then
    v_barangay := trim(split_part(v_area, ',', 1));
    v_town     := trim(split_part(v_area, ',', 2));
    select count(*), min(psgc_barangay_code), string_agg(name, '; ')
      into v_count, v_code, v_matches
      from public.zones
     where lower(name) in (lower('Barangay ' || v_barangay || ', ' || v_town),
                           lower(v_barangay || ', ' || v_town));
    if v_count = 0 then raise exception 'No barangay matches "%".', v_area; end if;
    if v_count > 1 then raise exception 'Ambiguous: "%" matches %.', v_area, v_matches; end if;
    v_label := v_barangay || ', ' || v_town;
  else
    select count(*), min(code), string_agg(name || ' (' || code || ')', '; ')
      into v_count, v_code, v_matches
      from public.municipalities where lower(name) = lower(v_area);
    if v_count = 0 then
      raise exception 'No town named "%". For a barangay use "<Barangay>, <Town>".', v_area;
    end if;
    if v_count > 1 then
      raise exception 'Ambiguous: "%" matches %. Pass the code instead.', v_area, v_matches;
    end if;
    v_label := v_area;
  end if;

  update public.profiles
     set role = 'operator', area_code = v_code, display_name = v_name
   where id = v_user;

  if not found then
    raise exception 'The account for % has no profile row, so nothing was changed. The profile-creation trigger did not run for this account; check it before appointing.', p_email;
  end if;

  select count(*), string_agg(name, '; ' order by name)
    into v_count, v_covered
    from public.zones where psgc_barangay_code like v_code || '%';

  perform private.record_official_action('official.appointed', null, v_user::text,
    jsonb_build_object('area', v_code, 'area_name', v_label, 'display_name', v_name),
    null);

  return format('%s is now an official for %s — covers %s barangay(s): %s',
                v_name, v_label, v_count, coalesce(v_covered, 'none'));
end;
$$;

create or replace function private.remove_official(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_name text;
  v_area text;
begin
  select u.id, p.display_name, p.area_code into v_user, v_name, v_area
    from auth.users u join public.profiles p on p.id = u.id
   where lower(u.email) = lower(trim(p_email)) and p.role = 'operator';
  if v_user is null then
    raise exception 'No official with email %.', p_email;
  end if;

  update public.profiles
     set role = 'resident', area_code = null, display_name = null
   where id = v_user;

  perform private.record_official_action('official.removed', null, v_user::text,
    jsonb_build_object('area', v_area, 'display_name', v_name), null);

  return format('%s is no longer an official (was %s).', v_name, v_area);
end;
$$;

revoke execute on function private.appoint_official(text, text, text) from public, anon, authenticated, service_role;
revoke execute on function private.remove_official(text)             from public, anon, authenticated, service_role;

-- 7. The admin-gated path lives in PUBLIC, not private — authenticated has
--    no USAGE on schema private at all (by design; see is_operator()'s own
--    comment on this exact gotcha), so a private-schema function cannot be
--    reached by name via PostgREST's rpc() at all, SECURITY DEFINER or not.
--    public.set_zone_alert is this codebase's own established precedent
--    for "authenticated calls a public wrapper that does its real work
--    through private-schema logic" — these two follow the same shape.
--    Neither function above had its own lockdown touched — this is a new,
--    separate, audited path, not a loosening of the old one.
create or replace function public.admin_appoint_official(
  p_email        text,
  p_area         text,
  p_display_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') then
    raise exception using errcode = '42501', message = 'only an admin may appoint officials';
  end if;
  return private.appoint_official(p_email, p_area, p_display_name);
end;
$$;

create or replace function public.admin_remove_official(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') then
    raise exception using errcode = '42501', message = 'only an admin may remove officials';
  end if;
  return private.remove_official(p_email);
end;
$$;

revoke execute on function public.admin_appoint_official(text, text, text) from public, anon;
revoke execute on function public.admin_remove_official(text)              from public, anon;
grant execute on function public.admin_appoint_official(text, text, text) to authenticated;
grant execute on function public.admin_remove_official(text)              to authenticated;
