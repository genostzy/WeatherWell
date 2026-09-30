-- set_barangay_profile records 'barangay.profile' in the action record, which
-- the action check did not yet allow (found by the FP2 check on the live database).
alter table public.official_actions drop constraint official_actions_action_check;
alter table public.official_actions add constraint official_actions_action_check check (action = any (array[
  'alert.set', 'alert.cleared', 'centre.status', 'centre.occupancy', 'centre.confirmed', 'pin.removed',
  'pin.restored', 'official.appointed', 'official.removed', 'official.password_reset', 'engine.tuned',
  'barangay.details', 'barangay.profile']));
