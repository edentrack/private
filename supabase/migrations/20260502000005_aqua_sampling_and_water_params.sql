-- Aquaculture: sampling events table + ammonia/nitrite on water_quality_logs

-- 1. Sampling events (weight sampling from a pond)
CREATE TABLE IF NOT EXISTS sampling_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id UUID NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  sampled_at DATE NOT NULL,
  sample_size INTEGER NOT NULL,                 -- number of fish weighed
  individual_weights_g NUMERIC[] NOT NULL,      -- raw per-fish weights
  abw_g NUMERIC(8,2),                           -- average body weight, computed on insert
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compute abw_g automatically from the array average
CREATE OR REPLACE FUNCTION compute_abw_g()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF array_length(NEW.individual_weights_g, 1) > 0 THEN
    SELECT AVG(v) INTO NEW.abw_g
    FROM unnest(NEW.individual_weights_g) AS v;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_abw_g ON sampling_events;
CREATE TRIGGER trg_compute_abw_g
  BEFORE INSERT OR UPDATE ON sampling_events
  FOR EACH ROW EXECUTE FUNCTION compute_abw_g();

-- 2. Add ammonia and nitrite columns to water_quality_logs (nullable, additive)
ALTER TABLE water_quality_logs
  ADD COLUMN IF NOT EXISTS ammonia_mgl NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS nitrite_mgl NUMERIC(6,3);

-- 3. RLS for sampling_events (same farm_members pattern)
ALTER TABLE sampling_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farm members can manage sampling events"
  ON sampling_events FOR ALL
  USING (farm_id IN (
    SELECT farm_id FROM farm_members WHERE user_id = auth.uid() AND is_active = true
  ))
  WITH CHECK (farm_id IN (
    SELECT farm_id FROM farm_members WHERE user_id = auth.uid() AND is_active = true
  ));
