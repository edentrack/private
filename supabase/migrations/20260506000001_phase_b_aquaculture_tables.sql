-- Phase B aquaculture tables — additive migration.
-- Covers Steps 8 (pond_growth_targets), 16 (pond_inspections),
-- 17 (feed_types extensions), 24 (pond_alerts), 25 (fingerling_sources).
--
-- Every new table:
--   - includes farm_id (uuid, NOT NULL)
--   - enables RLS
--   - gets the standard 4-policy block scoped to farm_members
-- per RLS_AUDIT.md.
--
-- All operations are IF NOT EXISTS / additive so re-running is safe.

-- ─── Step 8: pond_growth_targets ───────────────────────────────────────
-- Lets a power user override the species-default weight target on a
-- per-pond basis. Mirrors the existing flock_targets pattern.
CREATE TABLE IF NOT EXISTS public.pond_growth_targets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  flock_id        uuid NOT NULL REFERENCES public.flocks(id) ON DELETE CASCADE,
  week_number     integer NOT NULL CHECK (week_number >= 0 AND week_number <= 60),
  target_weight_g numeric(10,2) NOT NULL CHECK (target_weight_g > 0),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flock_id, week_number)
);

CREATE INDEX IF NOT EXISTS pond_growth_targets_flock_idx
  ON public.pond_growth_targets (flock_id);
CREATE INDEX IF NOT EXISTS pond_growth_targets_farm_idx
  ON public.pond_growth_targets (farm_id);

ALTER TABLE public.pond_growth_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pond_growth_targets_select ON public.pond_growth_targets;
CREATE POLICY pond_growth_targets_select ON public.pond_growth_targets
  FOR SELECT USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS pond_growth_targets_insert ON public.pond_growth_targets;
CREATE POLICY pond_growth_targets_insert ON public.pond_growth_targets
  FOR INSERT WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS pond_growth_targets_update ON public.pond_growth_targets;
CREATE POLICY pond_growth_targets_update ON public.pond_growth_targets
  FOR UPDATE USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS pond_growth_targets_delete ON public.pond_growth_targets;
CREATE POLICY pond_growth_targets_delete ON public.pond_growth_targets
  FOR DELETE USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

-- ─── Step 16: pond_inspections ─────────────────────────────────────────
-- Daily 30-second visual log of pond health between weight samplings.
-- Shorter than a sampling event, captures observations the meter doesn't see.
CREATE TABLE IF NOT EXISTS public.pond_inspections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id          uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  flock_id         uuid NOT NULL REFERENCES public.flocks(id) ON DELETE CASCADE,
  inspection_date  date NOT NULL DEFAULT CURRENT_DATE,
  water_clarity    text CHECK (water_clarity IN ('clear','murky','green','brown','black')),
  fish_behavior    text CHECK (fish_behavior IN ('normal','lethargic','gasping','erratic','feeding-vigorous')),
  feeding_response text CHECK (feeding_response IN ('vigorous','normal','slow','none')),
  dead_fish_count  integer DEFAULT 0 CHECK (dead_fish_count >= 0),
  notes            text,
  photo_url        text,
  inspected_by     uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pond_inspections_flock_date_idx
  ON public.pond_inspections (flock_id, inspection_date DESC);
CREATE INDEX IF NOT EXISTS pond_inspections_farm_idx
  ON public.pond_inspections (farm_id);

ALTER TABLE public.pond_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pond_inspections_select ON public.pond_inspections;
CREATE POLICY pond_inspections_select ON public.pond_inspections
  FOR SELECT USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS pond_inspections_insert ON public.pond_inspections;
CREATE POLICY pond_inspections_insert ON public.pond_inspections
  FOR INSERT WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS pond_inspections_update ON public.pond_inspections;
CREATE POLICY pond_inspections_update ON public.pond_inspections
  FOR UPDATE USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS pond_inspections_delete ON public.pond_inspections;
CREATE POLICY pond_inspections_delete ON public.pond_inspections
  FOR DELETE USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

-- ─── Step 17: feed_types extensions for fish ───────────────────────────
-- feed_types already exists. Add fish-specific columns. ALTER TABLE ADD
-- COLUMN IF NOT EXISTS is safe to re-run.
ALTER TABLE public.feed_types
  ADD COLUMN IF NOT EXISTS feed_form text CHECK (feed_form IN ('floating','sinking','crumble')),
  ADD COLUMN IF NOT EXISTS protein_pct numeric(4,1) CHECK (protein_pct > 0 AND protein_pct <= 100),
  ADD COLUMN IF NOT EXISTS life_stage text CHECK (life_stage IN ('starter','grower','finisher','broodstock')),
  ADD COLUMN IF NOT EXISTS pellet_size_mm numeric(4,2) CHECK (pellet_size_mm > 0);

-- ─── Step 24: pond_alerts (custom user-defined alerts) ─────────────────
-- Each row = one user-configured alert rule for a specific pond. A
-- background job evaluates rules and writes notifications when triggered.
CREATE TABLE IF NOT EXISTS public.pond_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id      uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  flock_id     uuid NOT NULL REFERENCES public.flocks(id) ON DELETE CASCADE,
  alert_type   text NOT NULL CHECK (alert_type IN (
    'mortality_per_day',
    'no_inspection_days',
    'do_below',
    'ammonia_above',
    'ph_below',
    'ph_above',
    'temp_below',
    'temp_above',
    'sgr_below',
    'fcr_above'
  )),
  threshold    numeric(10,3) NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  notify_via   text[] NOT NULL DEFAULT ARRAY['push'],
  last_triggered_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id),
  UNIQUE (flock_id, alert_type)
);

CREATE INDEX IF NOT EXISTS pond_alerts_flock_enabled_idx
  ON public.pond_alerts (flock_id) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS pond_alerts_farm_idx
  ON public.pond_alerts (farm_id);

ALTER TABLE public.pond_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pond_alerts_select ON public.pond_alerts;
CREATE POLICY pond_alerts_select ON public.pond_alerts
  FOR SELECT USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS pond_alerts_insert ON public.pond_alerts;
CREATE POLICY pond_alerts_insert ON public.pond_alerts
  FOR INSERT WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS pond_alerts_update ON public.pond_alerts;
CREATE POLICY pond_alerts_update ON public.pond_alerts
  FOR UPDATE USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS pond_alerts_delete ON public.pond_alerts;
CREATE POLICY pond_alerts_delete ON public.pond_alerts
  FOR DELETE USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

-- ─── Step 25: fingerling_sources ──────────────────────────────────────
-- Tracks where each batch of fingerlings came from. Useful for genetics +
-- biosecurity. When mortality spikes, Eden AI can correlate to source.
CREATE TABLE IF NOT EXISTS public.fingerling_sources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id        uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  hatchery_name  text NOT NULL,
  contact        text,
  location       text,
  notes          text,
  -- Aggregate trust metrics (auto-computed by background job from mortality rates):
  total_batches_received integer DEFAULT 0,
  total_fingerlings_received integer DEFAULT 0,
  avg_survival_pct numeric(5,2),
  trust_score     numeric(3,2) DEFAULT 0 CHECK (trust_score >= 0 AND trust_score <= 5),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, hatchery_name)
);

ALTER TABLE public.fingerling_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fingerling_sources_select ON public.fingerling_sources;
CREATE POLICY fingerling_sources_select ON public.fingerling_sources
  FOR SELECT USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS fingerling_sources_insert ON public.fingerling_sources;
CREATE POLICY fingerling_sources_insert ON public.fingerling_sources
  FOR INSERT WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS fingerling_sources_update ON public.fingerling_sources;
CREATE POLICY fingerling_sources_update ON public.fingerling_sources
  FOR UPDATE USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS fingerling_sources_delete ON public.fingerling_sources;
CREATE POLICY fingerling_sources_delete ON public.fingerling_sources
  FOR DELETE USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

-- Link stocking_events to fingerling_sources (additive, nullable for back-compat)
ALTER TABLE public.stocking_events
  ADD COLUMN IF NOT EXISTS fingerling_source_id uuid
    REFERENCES public.fingerling_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS avg_size_at_delivery_g numeric(8,2),
  ADD COLUMN IF NOT EXISTS transport_time_hours numeric(5,2),
  ADD COLUMN IF NOT EXISTS transport_survival_pct numeric(5,2);

CREATE INDEX IF NOT EXISTS stocking_events_fingerling_source_idx
  ON public.stocking_events (fingerling_source_id) WHERE fingerling_source_id IS NOT NULL;
