-- The four pilot barangays carried invented evacuation directions ("head to
-- the barangay road, then straight ahead to the elementary school on your
-- right") and matching map paths to schools that were never confirmed as
-- centres; every other barangay says to contact the barangay captain. Found
-- testing the live site. Reset to that placeholder, as their dummy hotlines
-- were (20260923124349), until an official confirms a real centre.
update public.zones
set evacuation_route_text = '{"en":"Contact your barangay captain for evacuation instructions.","fil":"Makipag-ugnayan sa inyong barangay captain para sa mga tagubilin sa paglikas."}'::jsonb,
    evacuation_route_path = jsonb_build_array(jsonb_build_array(lat, lng))
where id in ('zone-1', 'zone-2', 'zone-3', 'zone-4')
  and evacuation_route_text->>'en' <> 'Contact your barangay captain for evacuation instructions.';
