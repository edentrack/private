/*
  # Add Water Tracking and Feed/Water Consumption Tracking

  1. Extend inventory_usage to support water
  2. Create feed_consumption_tracking table
  3. Create water_consumption_tracking table
  4. Add expected feed intake and water consumption standards
*/

-- Extend inventory_usage to support water
ALTER TABLE inventory_usage 
  DROP CONSTRAINT IF EXISTS inventory_usage_item_type_check;

ALTER TABLE inventory_usage 
  ADD CONSTRAINT inventory_usage_item_type_check 
  CHECK (item_type IN ('feed', 'other', 'water'));

-- Create feed consumption tracking table
CREATE TABLE IF NOT EXISTS feed_consumption_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  flock_id uuid REFERENCES flocks(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  date date NOT NULL,
  expected_feed_intake_g_per_bird numeric(10,2) NOT NULL, -- Expected in grams per bird per day
  actual_feed_intake_g_per_bird numeric(10,2), -- Actual in grams per bird per day
  total_feed_used_kg numeric(10,2) NOT NULL, -- Total feed used in kg
  bird_count integer NOT NULL, -- Number of birds at this date
  cumulative_feed_intake_kg numeric(10,2), -- Cumulative feed intake per bird in kg
  recorded_by uuid REFERENCES profiles(id),
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feed_consumption_farm ON feed_consumption_tracking(farm_id);
CREATE INDEX IF NOT EXISTS idx_feed_consumption_flock ON feed_consumption_tracking(flock_id);
CREATE INDEX IF NOT EXISTS idx_feed_consumption_date ON feed_consumption_tracking(date);
CREATE INDEX IF NOT EXISTS idx_feed_consumption_week ON feed_consumption_tracking(week_number);

-- Create water consumption tracking table
CREATE TABLE IF NOT EXISTS water_consumption_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  flock_id uuid REFERENCES flocks(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  date date NOT NULL,
  expected_water_consumption_ml_per_bird numeric(10,2) NOT NULL, -- Expected in ml per bird per day
  actual_water_consumption_ml_per_bird numeric(10,2), -- Actual in ml per bird per day
  total_water_used_liters numeric(10,2) NOT NULL, -- Total water used in liters
  bird_count integer NOT NULL, -- Number of birds at this date
  recorded_by uuid REFERENCES profiles(id),
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_water_consumption_farm ON water_consumption_tracking(farm_id);
CREATE INDEX IF NOT EXISTS idx_water_consumption_flock ON water_consumption_tracking(flock_id);
CREATE INDEX IF NOT EXISTS idx_water_consumption_date ON water_consumption_tracking(date);
CREATE INDEX IF NOT EXISTS idx_water_consumption_week ON water_consumption_tracking(week_number);

-- Enable RLS
ALTER TABLE feed_consumption_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_consumption_tracking ENABLE ROW LEVEL SECURITY;

-- RLS Policies for feed_consumption_tracking
CREATE POLICY "Users can view feed consumption in their farm"
  ON feed_consumption_tracking
  FOR SELECT
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can record feed consumption in their farm"
  ON feed_consumption_tracking
  FOR INSERT
  TO authenticated
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can update feed consumption in their farm"
  ON feed_consumption_tracking
  FOR UPDATE
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- RLS Policies for water_consumption_tracking
CREATE POLICY "Users can view water consumption in their farm"
  ON water_consumption_tracking
  FOR SELECT
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can record water consumption in their farm"
  ON water_consumption_tracking
  FOR INSERT
  TO authenticated
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can update water consumption in their farm"
  ON water_consumption_tracking
  FOR UPDATE
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
