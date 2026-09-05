create schema if not exists private;

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'resident' check (role in ('resident','operator')),
  zone_id    text references public.zones (id),
  created_at timestamptz not null default now()
);

create index profiles_zone_id_idx on public.profiles (zone_id);

-- Every auth user gets a profile. Anonymous sign-ins go through auth.users too,
-- so this covers guests as well as account holders.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- No identity argument: it reads auth.uid() itself, so there is no uuid to
-- probe and therefore no way to enumerate operators.
create or replace function private.is_operator() returns boolean
language sql security definer set search_path = '' stable
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'operator'
  );
$$;

revoke execute on function private.is_operator()
  from public, anon, authenticated, service_role;

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;

create policy profiles_read_own_or_operator on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or (select private.is_operator()));

-- Deliberately no insert or update policy: role is not self-assignable, which
-- is the entire point of having a role.
