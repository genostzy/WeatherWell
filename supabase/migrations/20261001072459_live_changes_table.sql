-- Live updates through one small public table. Realtime's broadcast store has
-- no partitions on this project (nothing created them), so the announcements
-- of 20261001072331_live_update_announcements could not be stored. Instead each
-- change leaves a row here: its kind and the barangay or town code, nothing
-- else. Realtime publishes this table alone, phones listen for new rows and
-- refetch through the routes and RLS they already use. Anyone may read it
-- (it says only "barangay X has a new report"); no client writes it; rows
-- older than an hour are pruned as new ones arrive.
create table public.live_changes (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('report', 'alert', 'message')),
  zone_id text,
  town_code text,
  at timestamptz not null default now()
);
create index live_changes_at on public.live_changes (at);
alter table public.live_changes enable row level security;
create policy live_changes_read on public.live_changes for select to anon, authenticated using (true);
revoke all on public.live_changes from anon, authenticated;
grant select on public.live_changes to anon, authenticated;
alter publication supabase_realtime add table public.live_changes;

create or replace function private.announce_zone_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    delete from public.live_changes where at < now() - interval '1 hour';
    insert into public.live_changes (kind, zone_id) values (tg_argv[0], new.zone_id);
  exception when others then
    raise warning 'live update for % not recorded: %', new.zone_id, sqlerrm;
  end;
  return null;
end $$;
revoke execute on function private.announce_zone_change() from public, anon, authenticated;

create or replace function private.announce_town_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    delete from public.live_changes where at < now() - interval '1 hour';
    insert into public.live_changes (kind, town_code) values ('message', new.town_code);
  exception when others then
    raise warning 'live update for town % not recorded: %', new.town_code, sqlerrm;
  end;
  return null;
end $$;
revoke execute on function private.announce_town_update() from public, anon, authenticated;
