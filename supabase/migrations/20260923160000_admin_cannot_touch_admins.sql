-- Final review finding (2026-09-22-admin-role-and-password-auth): the spec
-- says "Appoint and remove admins: No — still by hand, in Supabase, by you"
-- and lists "Admins appointing other admins, from the app, ever" as out of
-- scope — but nothing stopped an admin from using the *appoint* form on an
-- email that already belongs to another admin (or themselves), silently
-- demoting them to 'operator'. private.appoint_official/remove_official
-- themselves are untouched here (their lockdown is the SQL-editor "by hand"
-- escape hatch the spec relies on) — the guard belongs in the public
-- wrappers, the one new in-app path this plan added.
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
  if exists (
    select 1 from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = lower(trim(p_email)) and p.role = 'admin'
  ) then
    raise exception 'That account is an admin; admins are managed in Supabase only, not from this form.';
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
  if exists (
    select 1 from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = lower(trim(p_email)) and p.role = 'admin'
  ) then
    raise exception 'That account is an admin; admins are managed in Supabase only, not from this form.';
  end if;
  return private.remove_official(p_email);
end;
$$;
