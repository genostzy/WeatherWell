-- Officials fill in their barangay's hotlines and evacuation instructions
-- (docs/superpowers/specs/2026-09-28-barangay-details-design.md). Additive:
-- the app in production reads none of this and keeps working.

-- Up to 2 numbers after hotline_number, and when an official last saved the
-- details (null: still the seed placeholder). /api/barangay-details lists the
-- rows where it is set; the partial index keeps that read small.
alter table public.zones
  add column extra_hotlines text[] not null default '{}',
  add column details_set_at timestamptz,
  add constraint zones_extra_hotlines_max_2 check (cardinality(extra_hotlines) <= 2);
create index zones_details_set_at_idx on public.zones (details_set_at) where details_set_at is not null;

alter table public.official_actions drop constraint official_actions_action_check;
alter table public.official_actions add constraint official_actions_action_check check (action = any (array[
  'alert.set', 'alert.cleared', 'centre.status', 'centre.occupancy', 'centre.confirmed', 'pin.removed',
  'pin.restored', 'official.appointed', 'official.removed', 'official.password_reset', 'engine.tuned',
  'barangay.details']));

-- The one way an official changes a barangay's hotlines and instructions.
-- Checks who (private.manages_zone: the barangay's official, the town's, or
-- an admin), then what: 0-3 numbers of 3-20 digits, spaces and + - ( ), never
-- all zeros; instructions in at least one language, at most 1,000 characters
-- each, a blank language given the other's text. No numbers stores the
-- seed's all-zero placeholder, which every screen reads as "no hotline".
-- Returns what it saved, so the official's phone can show it without a
-- refetch the service worker's cache would answer with the old copy.
create or replace function public.set_barangay_details(
  p_zone_id text,
  p_hotlines text[],
  p_instructions_en text,
  p_instructions_fil text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numbers text[] := array(
    select btrim(h.n) from unnest(coalesce(p_hotlines, '{}'::text[])) with ordinality as h(n, i)
     where btrim(h.n) <> '' order by h.i);
  v_en text := btrim(coalesce(p_instructions_en, ''));
  v_fil text := btrim(coalesce(p_instructions_fil, ''));
  v_number text;
  v_digits text;
  v_route jsonb;
  v_main text;
  v_extra text[];
begin
  if not private.manages_zone(p_zone_id) then
    raise exception using errcode = '42501', message = 'not an official for this barangay';
  end if;
  if cardinality(v_numbers) > 3 then
    raise exception using errcode = '22023', message = 'at most 3 hotline numbers';
  end if;
  foreach v_number in array v_numbers loop
    v_digits := regexp_replace(v_number, '[^0-9]', '', 'g');
    if v_number !~ '^[0-9+() -]{3,20}$' or length(v_digits) < 3 then
      raise exception using errcode = '22023', message = 'a hotline number uses 3 to 20 digits, spaces and + - ( )';
    end if;
    if v_digits ~ '^0+$' then
      raise exception using errcode = '22023', message = 'a hotline number cannot be all zeros';
    end if;
  end loop;
  if v_en = '' and v_fil = '' then
    raise exception using errcode = '22023', message = 'write the instructions in English or Filipino';
  end if;
  if length(v_en) > 1000 or length(v_fil) > 1000 then
    raise exception using errcode = '22023', message = 'instructions must be 1,000 characters or fewer';
  end if;

  v_route := jsonb_build_object('en', coalesce(nullif(v_en, ''), v_fil), 'fil', coalesce(nullif(v_fil, ''), v_en));
  v_main := coalesce(v_numbers[1], '00000000000');
  v_extra := coalesce(v_numbers[2:3], '{}'::text[]);

  update public.zones
     set hotline_number = v_main,
         extra_hotlines = v_extra,
         evacuation_route_text = v_route,
         details_set_at = now()
   where id = p_zone_id;

  perform private.record_official_action('barangay.details', p_zone_id, p_zone_id,
    jsonb_build_object(
      'hotlines', to_jsonb(v_numbers),
      'wrote', to_jsonb(array_remove(array[
        case when v_en <> '' then 'en' end,
        case when v_fil <> '' then 'fil' end], null))));

  return jsonb_build_object('id', p_zone_id, 'hotline_number', v_main,
    'extra_hotlines', to_jsonb(v_extra), 'evacuation_route_text', v_route);
end $$;

revoke all on function public.set_barangay_details(text, text[], text, text) from public, anon;
grant execute on function public.set_barangay_details(text, text[], text, text) to authenticated;
