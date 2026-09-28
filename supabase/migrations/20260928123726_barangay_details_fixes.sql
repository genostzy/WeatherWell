-- The final review's fixes to 20260928083830_barangay_details. Additive:
-- a column, and two functions replaced with the same signatures and grants.

-- A centre an official confirmed reaches phones even before it has a
-- capacity or a status: /api/centres lists confirmed_at, not only values
-- that differ from the seed placeholder, which a confirmed centre with
-- capacity 0 and no status yet did not.
alter table public.evacuation_centers add column confirmed_at timestamptz;
update public.evacuation_centers c
   set confirmed_at = a.occurred_at
  from (select target_id, max(occurred_at) as occurred_at
          from public.official_actions
         where action = 'centre.confirmed'
         group by target_id) a
 where c.id = a.target_id;

create or replace function public.confirm_evacuation_center(
  p_zone_id text, p_name text, p_lat double precision, p_lng double precision, p_capacity integer
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_zone record;
  v_name text := btrim(coalesce(p_name, ''));
  v_id text;
begin
  if not private.manages_zone(p_zone_id) then
    raise exception using errcode = '42501', message = 'not an official for this barangay';
  end if;
  if length(v_name) = 0 or length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'centre name must be 1-120 characters';
  end if;
  if p_capacity is null or p_capacity < 0 or p_capacity > 100000 then
    raise exception using errcode = '22023', message = 'capacity must be 0-100000';
  end if;

  select z.lat, z.lng into v_zone from public.zones z where z.id = p_zone_id;
  -- Within 5 km of the barangay: the candidates are searched within 2 km,
  -- and a centre residents cannot walk to is not their centre.
  if 111320 * sqrt(power(p_lat - v_zone.lat, 2) + power((p_lng - v_zone.lng) * cos(radians(v_zone.lat)), 2)) > 5000 then
    raise exception using errcode = '22023', message = 'centre must be within 5 km of the barangay';
  end if;

  select c.id into v_id from public.evacuation_centers c where c.zone_id = p_zone_id limit 1;
  if v_id is null then
    v_id := 'center-' || p_zone_id;
    insert into public.evacuation_centers (id, zone_id, name, lat, lng, capacity, status, confirmed_at)
    values (v_id, p_zone_id, v_name, p_lat, p_lng, p_capacity, 'unknown', now());
  else
    update public.evacuation_centers
       set name = v_name, lat = p_lat, lng = p_lng, capacity = p_capacity, confirmed_at = now()
     where id = v_id;
  end if;

  perform private.record_official_action('centre.confirmed', p_zone_id, v_id,
    jsonb_build_object('name', v_name, 'capacity', p_capacity), null);
end $function$;

-- set_barangay_details trims every kind of whitespace (a box holding only a
-- newline is blank; btrim removed only spaces), and stores each language as
-- written. The phone shows the other language where one is blank, marked
-- with that text's real language, which a copy made here could not tell it.
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
    select t.n
      from (select regexp_replace(h.n, '^\s+|\s+$', '', 'g') as n, h.i
              from unnest(coalesce(p_hotlines, '{}'::text[])) with ordinality as h(n, i)) t
     where t.n <> ''
     order by t.i);
  v_en text := regexp_replace(coalesce(p_instructions_en, ''), '^\s+|\s+$', '', 'g');
  v_fil text := regexp_replace(coalesce(p_instructions_fil, ''), '^\s+|\s+$', '', 'g');
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

  v_route := jsonb_build_object('en', v_en, 'fil', v_fil);
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
