-- Live updates (the owner's request, 1 October): open dashboards refresh when
-- a water-level report, an alert or an officials' update changes, without a
-- reload. The database announces only that something changed, and where: a
-- barangay id on "zone-changes", a town code on "town-updates". No row data is
-- sent, so a report's position or an update's words never travel this way;
-- the screens refetch through the routes and RLS they already use. A failed
-- announcement is ignored: it must never stop the write itself.
create or replace function private.announce_zone_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send(jsonb_build_object('zone_id', new.zone_id), tg_argv[0], 'zone-changes', false);
  exception when others then
    raise warning 'live update for % not sent: %', new.zone_id, sqlerrm;
  end;
  return null;
end $$;
revoke execute on function private.announce_zone_change() from public, anon, authenticated;

create or replace function private.announce_town_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send(jsonb_build_object('town_code', new.town_code), 'message', 'town-updates', false);
  exception when others then
    raise warning 'live update for town % not sent: %', new.town_code, sqlerrm;
  end;
  return null;
end $$;
revoke execute on function private.announce_town_update() from public, anon, authenticated;

create trigger water_level_reports_announce
  after insert on public.water_level_reports
  for each row execute function private.announce_zone_change('report');

create trigger alerts_announce
  after insert or update on public.alerts
  for each row execute function private.announce_zone_change('alert');

create trigger official_messages_announce
  after insert or update on public.official_messages
  for each row execute function private.announce_town_update();
