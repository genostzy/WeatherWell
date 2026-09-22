-- Adds police_station and fire_station to points_of_interest.category —
-- "critical facilities" on a hazard map conventionally include police and
-- fire, and the category set had no way to represent either.
alter table public.points_of_interest
  drop constraint points_of_interest_category_check;

alter table public.points_of_interest
  add constraint points_of_interest_category_check
  check (category = any (array[
    'health_center', 'pharmacy', 'market', 'water_station', 'barangay_office',
    'police_station', 'fire_station'
  ]));
