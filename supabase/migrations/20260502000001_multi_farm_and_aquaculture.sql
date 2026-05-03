-- Multi-farm support + Aquaculture farm type

-- 1. Add farm_type and location columns to farms
ALTER TABLE farms ADD COLUMN IF NOT EXISTS farm_type TEXT NOT NULL DEFAULT 'poultry';
ALTER TABLE farms ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE farms DROP CONSTRAINT IF EXISTS farms_farm_type_check;
ALTER TABLE farms ADD CONSTRAINT farms_farm_type_check
  CHECK (farm_type IN ('poultry', 'aquaculture'));

-- 2. Relax the flocks.type constraint to allow fish types
ALTER TABLE flocks DROP CONSTRAINT IF EXISTS flocks_type_check;
ALTER TABLE flocks ADD CONSTRAINT flocks_type_check
  CHECK (type IN ('Layer', 'Broiler', 'Catfish', 'Tilapia', 'Clarias', 'Other Fish'));

-- 3. Stocking events (fingerlings added to a pond)
CREATE TABLE IF NOT EXISTS stocking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id UUID NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  stocked_at DATE NOT NULL,
  species TEXT NOT NULL DEFAULT 'catfish',
  fingerling_count INTEGER NOT NULL,
  source TEXT,
  cost_per_fingerling NUMERIC(10,2),
  total_cost NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Water quality logs
CREATE TABLE IF NOT EXISTS water_quality_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id UUID NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  logged_at DATE NOT NULL,
  temperature_c NUMERIC(5,2),
  dissolved_oxygen NUMERIC(5,2),
  ph NUMERIC(4,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Fish harvest records
CREATE TABLE IF NOT EXISTS harvest_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id UUID NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  harvested_at DATE NOT NULL,
  total_weight_kg NUMERIC(10,3) NOT NULL,
  price_per_kg NUMERIC(10,2),
  total_amount NUMERIC(12,2),
  buyer_name TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Enable RLS
ALTER TABLE stocking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_quality_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_records ENABLE ROW LEVEL SECURITY;

-- 7. RLS policies (same pattern as rest of app: farm_members check)
CREATE POLICY "Farm members can manage stocking events"
  ON stocking_events FOR ALL
  USING (farm_id IN (
    SELECT farm_id FROM farm_members WHERE user_id = auth.uid() AND is_active = true
  ))
  WITH CHECK (farm_id IN (
    SELECT farm_id FROM farm_members WHERE user_id = auth.uid() AND is_active = true
  ));

CREATE POLICY "Farm members can manage water quality logs"
  ON water_quality_logs FOR ALL
  USING (farm_id IN (
    SELECT farm_id FROM farm_members WHERE user_id = auth.uid() AND is_active = true
  ))
  WITH CHECK (farm_id IN (
    SELECT farm_id FROM farm_members WHERE user_id = auth.uid() AND is_active = true
  ));

CREATE POLICY "Farm members can manage harvest records"
  ON harvest_records FOR ALL
  USING (farm_id IN (
    SELECT farm_id FROM farm_members WHERE user_id = auth.uid() AND is_active = true
  ))
  WITH CHECK (farm_id IN (
    SELECT farm_id FROM farm_members WHERE user_id = auth.uid() AND is_active = true
  ));
