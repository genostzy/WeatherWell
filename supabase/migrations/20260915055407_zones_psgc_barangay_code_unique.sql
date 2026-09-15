-- P5-b (parked finding): public.zones.psgc_barangay_code has no UNIQUE
-- constraint, and src/lib/auth/load-official.ts looks a zone up by it with
-- .maybeSingle(), which throws if two zones ever share a code. Since
-- psgc_barangay_code is the actual permission boundary for who may issue a
-- flood alert for a barangay, a duplicate is a safety-critical data defect,
-- not just an app crash. This adds the missing constraint at the database
-- layer so a duplicate can never be inserted, regardless of client.
alter table public.zones
  add constraint zones_psgc_barangay_code_key unique (psgc_barangay_code);
