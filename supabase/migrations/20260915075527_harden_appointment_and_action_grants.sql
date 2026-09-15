-- Final-review hardening for the officials-and-roles plan.
--
-- M6: private.appoint_official now refuses (a) an account whose email is not
-- confirmed, and (b) a matched user with no public.profiles row. Every other
-- message is unchanged. The function is re-created whole; its ACL is carried
-- over by create or replace, and the revoke is restated below regardless.
--
-- M8: anon loses the default SELECT grant on public.official_actions. RLS
-- already returns anon nothing; the grant now says no as well, the "both
-- layers say no" rule every other table in this plan follows.

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

  -- M6: only an address the person has proved they own. Safe today only
  -- because email autoconfirm is off; if it were ever turned on, anyone could
  -- register an official's address first and be appointed in their place.
  if not exists (select 1 from auth.users where id = v_user and email_confirmed_at is not null) then
    raise exception 'The account for % has not confirmed its email yet. Ask them to finish signing in (open the emailed link, or complete Google sign-in), then try again.', p_email;
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

  -- M6: a user with no profiles row would otherwise be reported appointed,
  -- and recorded as appointed, by an update that changed nothing.
  if not found then
    raise exception 'The account for % has no profile row, so nothing was changed. The profile-creation trigger did not run for this account; check it before appointing.', p_email;
  end if;

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

revoke execute on function private.appoint_official(text, text, text) from public, anon, authenticated, service_role;

revoke select on public.official_actions from anon;
