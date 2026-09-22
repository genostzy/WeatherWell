-- ============================================================
-- Extend typhoon_tracks with bulletin-level fields for PAGASA integration
-- ============================================================

-- Add bulletin metadata columns
ALTER TABLE public.typhoon_tracks
  ADD COLUMN IF NOT EXISTS bulletin_number integer,
  ADD COLUMN IF NOT EXISTS is_final boolean not null default false,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_bulletin_at timestamptz,
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS max_winds_kph real,
  ADD COLUMN IF NOT EXISTS gustiness_kph real,
  ADD COLUMN IF NOT EXISTS pressure_hpa real,
  ADD COLUMN IF NOT EXISTS movement_direction text,
  ADD COLUMN IF NOT EXISTS movement_speed_kph real,
  ADD COLUMN IF NOT EXISTS wind_signal integer not null default 0,
  ADD COLUMN IF NOT EXISTS signals jsonb not null default '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source text not null default 'unknown';

-- Index for signal-level queries (wind_signal > 0 means active warnings)
CREATE INDEX IF NOT EXISTS idx_typhoon_tracks_signal
  ON public.typhoon_tracks (wind_signal) WHERE wind_signal > 0;

-- Add a comment explaining the signals column structure
COMMENT ON COLUMN public.typhoon_tracks.signals IS
  'PAGASA TCWS signal data: [{signalLevel: 1-5, areas: [{locationName, partialDescriptor, raw}]}]';
COMMENT ON COLUMN public.typhoon_tracks.wind_signal IS
  'Highest current wind signal level (0 = none, 1-5 = PAGASA TCWS)';
COMMENT ON COLUMN public.typhoon_tracks.source IS
  'Data source: html (bulletin page), pdf (TCB document), or unknown';
