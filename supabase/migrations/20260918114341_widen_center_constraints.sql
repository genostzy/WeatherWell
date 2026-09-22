-- Widen evacuation_centers constraints for nationwide data.
--
-- V0's 4 demo barangays had real evacuation centres with known capacity and
-- status.  V1's ~42,000 nationwide zones start with placeholder centres whose
-- capacity and status are not yet known.  This migration adds 'unknown' to
-- the status check and allows capacity = 0 for the same reason.
--
-- The check constraint is unnamed in the original migration, so we drop and
-- recreate it.

begin;

alter table public.evacuation_centers
  drop constraint if exists evacuation_centers_status_check;

alter table public.evacuation_centers
  add constraint evacuation_centers_status_check
    check (status in ('space_available','limited','full','unknown'));

alter table public.evacuation_centers
  drop constraint if exists evacuation_centers_capacity_check;

-- Allow capacity = 0 for placeholder centres.  Real centres will have > 0.
alter table public.evacuation_centers
  add constraint evacuation_centers_capacity_check
    check (capacity >= 0);

-- Widen hazard_susceptibility risk_level for nationwide data.
-- V0's 4 demo barangays had real hazard ratings.  V1's ~42,000 nationwide
-- zones start with 'unknown' until real DENR-MGB data is ingested.

alter table public.hazard_susceptibility
  drop constraint if exists hazard_susceptibility_risk_level_check;

alter table public.hazard_susceptibility
  add constraint hazard_susceptibility_risk_level_check
    check (risk_level in ('low','medium','high','unknown'));

commit;
