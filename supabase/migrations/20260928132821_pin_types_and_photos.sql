-- Pin types, and pin photos only officials can read
-- (docs/superpowers/specs/2026-09-28-pin-types-and-photos-design.md). Additive.

-- The app checked the tag alone; now the database does too. Live pins use
-- only flooded and rising.
alter table public.community_pins add constraint community_pins_status_tag_check check (status_tag = any (array[
  'flooded', 'rising', 'receding', 'impassable', 'road_blocked', 'landslide', 'power_line_down', 'other']));

-- Private: a photo is read only through a signed link an official's session makes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pin-photos', 'pin-photos', false, 512000, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- A resident uploads only into their own folder, <auth.uid()>/...
create policy pin_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'pin-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Only officials read them, any area, as with the action record. No update
-- policy; deletion is the service role's (the daily cleanup).
create policy pin_photos_read_officials on storage.objects for select to authenticated
  using (bucket_id = 'pin-photos' and (select private.is_operator()));

-- Sets a pin's photo once the phone has uploaded it. Residents keep no direct
-- write on photo_path: this checks the caller wrote the pin, the pin is still
-- up, and the photo sits in the caller's own folder and exists.
create or replace function public.attach_pin_photo(p_pin_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_pin record;
begin
  select p.author_id, p.removed into v_pin from public.community_pins p where p.id = p_pin_id;
  if not found or v_uid is null or v_pin.author_id::text <> v_uid then
    raise exception using errcode = '42501', message = 'not your pin';
  end if;
  if v_pin.removed then
    raise exception using errcode = '22023', message = 'the pin is removed';
  end if;
  if p_path is null or p_path !~ ('^' || v_uid || '/[^/]+$') or position('..' in p_path) > 0 then
    raise exception using errcode = '22023', message = 'the photo is not in your folder';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'pin-photos' and o.name = p_path) then
    raise exception using errcode = '22023', message = 'no such photo';
  end if;
  update public.community_pins set photo_path = p_path where id = p_pin_id;
end $$;

revoke all on function public.attach_pin_photo(uuid, text) from public, anon;
grant execute on function public.attach_pin_photo(uuid, text) to authenticated;

-- What the daily cleanup deletes through the Storage API (a row removed here
-- in SQL would leave the file behind): photos over 7 days old, photos of
-- removed pins, and uploads over an hour old that no pin points to.
create or replace function public.pin_photos_to_delete()
returns table (path text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'pin-photos'
     and (o.created_at < now() - interval '7 days'
          or exists (select 1 from public.community_pins p where p.photo_path = o.name and p.removed)
          or (o.created_at < now() - interval '1 hour'
              and not exists (select 1 from public.community_pins p where p.photo_path = o.name)));
$$;

revoke all on function public.pin_photos_to_delete() from public, anon, authenticated;
grant execute on function public.pin_photos_to_delete() to service_role;
