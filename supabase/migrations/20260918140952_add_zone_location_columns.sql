-- Add municipality_name and province_name to zones, populate from PSGC, add full-text search
begin;

-- 1. Add columns
ALTER TABLE public.zones ADD COLUMN IF NOT EXISTS municipality_name text;
ALTER TABLE public.zones ADD COLUMN IF NOT EXISTS province_name text;

-- 2. Parse municipality_name from zone name (text after last comma)
UPDATE public.zones
SET municipality_name = TRIM(substring(name FROM ',\s*(.+)$'))
WHERE municipality_name IS NULL;

-- 3. Province name mapping from PSGC code (first 5 digits)
UPDATE public.zones SET province_name = CASE substring(psgc_barangay_code, 1, 5)
  WHEN '01028' THEN 'Ilocos Norte'
  WHEN '01029' THEN 'Ilocos Sur'
  WHEN '01033' THEN 'La Union'
  WHEN '01055' THEN 'Pangasinan'
  WHEN '02009' THEN 'Batanes'
  WHEN '02015' THEN 'Cagayan'
  WHEN '02031' THEN 'Isabela'
  WHEN '02050' THEN 'Nueva Vizcaya'
  WHEN '02057' THEN 'Quirino'
  WHEN '03008' THEN 'Bataan'
  WHEN '03014' THEN 'Bulacan'
  WHEN '03049' THEN 'Nueva Ecija'
  WHEN '03054' THEN 'Pampanga'
  WHEN '03069' THEN 'Tarlac'
  WHEN '03071' THEN 'Zambales'
  WHEN '03077' THEN 'Aurora'
  WHEN '03301' THEN 'Angeles'
  WHEN '03314' THEN 'Olongapo'
  WHEN '04010' THEN 'Batangas'
  WHEN '04021' THEN 'Cavite'
  WHEN '04034' THEN 'Laguna'
  WHEN '04056' THEN 'Quezon'
  WHEN '04058' THEN 'Rizal'
  WHEN '04312' THEN 'Lucena'
  WHEN '05005' THEN 'Albay'
  WHEN '05016' THEN 'Camarines Norte'
  WHEN '05017' THEN 'Camarines Sur'
  WHEN '05020' THEN 'Catanduanes'
  WHEN '05041' THEN 'Masbate'
  WHEN '05062' THEN 'Sorsogon'
  WHEN '06004' THEN 'Aklan'
  WHEN '06006' THEN 'Antique'
  WHEN '06019' THEN 'Capiz'
  WHEN '06030' THEN 'Guimaras'
  WHEN '06045' THEN 'Iloilo'
  WHEN '06079' THEN 'Negros Occidental'
  WHEN '06302' THEN 'Bacolod'
  WHEN '06310' THEN 'Iloilo City'
  WHEN '07012' THEN 'Bohol'
  WHEN '07022' THEN 'Cebu'
  WHEN '07046' THEN 'Negros Oriental'
  WHEN '07061' THEN 'Siquijor'
  WHEN '07306' THEN 'Cebu City'
  WHEN '07311' THEN 'Lapu-Lapu'
  WHEN '07313' THEN 'Mandaue'
  WHEN '08026' THEN 'Eastern Samar'
  WHEN '08037' THEN 'Leyte'
  WHEN '08048' THEN 'Northern Samar'
  WHEN '08060' THEN 'Samar'
  WHEN '08064' THEN 'Southern Leyte'
  WHEN '08078' THEN 'Biliran'
  WHEN '08316' THEN 'Tacloban'
  WHEN '09072' THEN 'Zamboanga del Norte'
  WHEN '09073' THEN 'Zamboanga del Sur'
  WHEN '09083' THEN 'Zamboanga Sibugay'
  WHEN '09317' THEN 'Zamboanga City'
  WHEN '09901' THEN 'Isabela City'
  WHEN '10013' THEN 'Bukidnon'
  WHEN '10018' THEN 'Camiguin'
  WHEN '10035' THEN 'Lanao del Norte'
  WHEN '10042' THEN 'Misamis Occidental'
  WHEN '10043' THEN 'Misamis Oriental'
  WHEN '10305' THEN 'Cagayan de Oro'
  WHEN '10309' THEN 'Iligan'
  WHEN '11023' THEN 'Davao del Norte'
  WHEN '11024' THEN 'Davao del Sur'
  WHEN '11025' THEN 'Davao Oriental'
  WHEN '11082' THEN 'Davao de Oro'
  WHEN '11086' THEN 'Davao Occidental'
  WHEN '11307' THEN 'Davao City'
  WHEN '12047' THEN 'Cotabato'
  WHEN '12063' THEN 'South Cotabato'
  WHEN '12065' THEN 'Sultan Kudarat'
  WHEN '12080' THEN 'Sarangani'
  WHEN '12308' THEN 'General Santos'
  WHEN '13801' THEN 'Metro Manila - Manila'
  WHEN '13802' THEN 'Metro Manila - Mandaluyong'
  WHEN '13803' THEN 'Metro Manila - Marikina'
  WHEN '13804' THEN 'Metro Manila - Pasig'
  WHEN '13805' THEN 'Metro Manila - Quezon City'
  WHEN '13806' THEN 'Metro Manila - San Juan'
  WHEN '13807' THEN 'Metro Manila - Caloocan'
  WHEN '13808' THEN 'Metro Manila - Malabon'
  WHEN '13809' THEN 'Metro Manila - Navotas'
  WHEN '13810' THEN 'Metro Manila - Valenzuela'
  WHEN '13811' THEN 'Metro Manila - Quezon City'
  WHEN '13812' THEN 'Metro Manila - Las Piñas'
  WHEN '13813' THEN 'Metro Manila - Makati'
  WHEN '13814' THEN 'Metro Manila - Malate'
  WHEN '13815' THEN 'Metro Manila - Manila'
  WHEN '13816' THEN 'Metro Manila - Parañaque'
  WHEN '13817' THEN 'Metro Manila - Pasay'
  WHEN '14001' THEN 'Abra'
  WHEN '14011' THEN 'Benguet'
  WHEN '14027' THEN 'Ifugao'
  WHEN '14032' THEN 'Kalinga'
  WHEN '14044' THEN 'Mountain Province'
  WHEN '14081' THEN 'Apayao'
  WHEN '14303' THEN 'Baguio'
  WHEN '16002' THEN 'Agusan del Norte'
  WHEN '16003' THEN 'Agusan del Sur'
  WHEN '16067' THEN 'Surigao del Norte'
  WHEN '16068' THEN 'Surigao del Sur'
  WHEN '16085' THEN 'Dinagat Islands'
  WHEN '16304' THEN 'Butuan'
  WHEN '17040' THEN 'Palawan'
  WHEN '17051' THEN 'Romblon'
  WHEN '17052' THEN 'Sulu'
  WHEN '17053' THEN 'Tawi-Tawi'
  WHEN '17059' THEN 'Palawan'
  WHEN '17315' THEN 'Puerto Princesa'
  WHEN '19007' THEN 'Basilan'
  WHEN '19036' THEN 'Lanao del Sur'
  WHEN '19066' THEN 'Maguindanao'
  WHEN '19070' THEN 'Sulu'
  WHEN '19087' THEN 'Tawi-Tawi'
  WHEN '19088' THEN 'Cotabato'
  WHEN '19999' THEN 'Bangsamoro'
  ELSE 'Unknown'
END
WHERE province_name IS NULL;

-- 4. Add NOT NULL constraints after populating
ALTER TABLE public.zones ALTER COLUMN municipality_name SET NOT NULL;
ALTER TABLE public.zones ALTER COLUMN province_name SET NOT NULL;

-- 5. Add default values for new rows
ALTER TABLE public.zones ALTER COLUMN municipality_name SET DEFAULT '';
ALTER TABLE public.zones ALTER COLUMN province_name SET DEFAULT '';

-- 6. Create trigram index for fast ILIKE search
-- pg_trgm was enabled by hand on the live database (in schema public) before
-- this ran; a rebuild from the repo needs it stated (found by CI, M2).
create extension if not exists pg_trgm with schema public;
CREATE INDEX IF NOT EXISTS idx_zones_name_trgm ON public.zones USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_zones_municipality ON public.zones (municipality_name);
CREATE INDEX IF NOT EXISTS idx_zones_province ON public.zones (province_name);

-- 7. Create composite index for search
CREATE INDEX IF NOT EXISTS idx_zones_search ON public.zones USING gin (
  to_tsvector('simple', name || ' ' || municipality_name || ' ' || province_name)
);

commit;
