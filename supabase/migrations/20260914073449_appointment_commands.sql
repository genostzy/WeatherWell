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

  if v_area ~ '^(\d{7}|\d{10})$' then
    -- Escape hatch for names that are ambiguous. The echo below shows what it covers.
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

  select count(*), string_agg(name, '; ' order by name)
    into v_count, v_covered
    from public.zones where psgc_barangay_code like v_code || '%';

  perform private.record_official_action('official.appointed', null, v_user::text,
    jsonb_build_object('area', v_code, 'area_name', v_label, 'display_name', v_name),
    'System owner');

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
    jsonb_build_object('area', v_area, 'display_name', v_name), 'System owner');

  return format('%s is no longer an official (was %s).', v_name, v_area);
end;
$$;

revoke execute on function private.appoint_official(text, text, text) from public, anon, authenticated, service_role;
revoke execute on function private.remove_official(text)             from public, anon, authenticated, service_role;
