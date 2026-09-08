-- The outbox generates a report's primary key on the client, so a queued
-- write that actually landed before the connection dropped conflicts on
-- insert rather than creating a second report. That requires `id` to be
-- insertable. It carries no authority: a uuid says nothing, and a duplicate
-- is refused by the primary key.
--
-- trust_weight, is_outlier and reported_at stay server-controlled — those
-- feed the anti-abuse reputation model and a client must not touch them.
grant insert (id, zone_id, depth_level, reporter_id)
  on public.water_level_reports to authenticated;
