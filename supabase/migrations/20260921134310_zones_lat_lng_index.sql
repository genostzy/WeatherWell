-- Supports the bounding-box prefilter in GET /api/zones/nearest (onboarding's
-- "use my location" step): without this, matching a GPS fix to the nearest of
-- ~42k barangays is a sequential scan on every request. zones has no index on
-- (lat, lng) at all yet — every other zones index is for name/municipality/
-- province text search.
create index idx_zones_lat_lng on public.zones using btree (lat, lng);
