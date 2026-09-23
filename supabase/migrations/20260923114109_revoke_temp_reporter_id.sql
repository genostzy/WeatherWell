-- Ends the temporary grant from temp_regrant_reporter_id_until_deploy. The
-- deployed app no longer selects reporter_id, so it goes back to being
-- unreadable with the public key, as hide_report_locations intended.
revoke select (reporter_id) on public.water_level_reports from anon, authenticated;
