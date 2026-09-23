-- The four pilot barangays carried 0917-123-4567..4570, sequential dummy
-- numbers that the app presented as real emergency hotlines. Reset to the
-- seed's all-zero placeholder, which every screen already reads as "no
-- verified hotline — ask your barangay hall" (src/lib/zone-data-quality.ts),
-- until real MDRRMO numbers are entered.
update public.zones
set hotline_number = '00000000000'
where id in ('zone-1', 'zone-2', 'zone-3', 'zone-4')
  and hotline_number in ('09171234567', '09171234568', '09171234569', '09171234570');
