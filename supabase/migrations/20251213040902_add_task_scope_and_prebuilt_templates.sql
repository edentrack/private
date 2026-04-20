/*
  # Task System Enhancement - Scope and Prebuilt Templates

  1. Schema Changes
    - Add `task_scope` to task_templates (general, broiler, layer)
    - Add `task_type_category` to task_templates (daily, one_time, recording)
    - Add `is_archived` to tasks for soft delete
    - Add `is_system_template` flag for prebuilt templates
    - Add `flock_type_filter` for automatic scope filtering

  2. New Tables
    - `layer_weight_targets` - breed-specific weekly weight targets
    - `layer_weight_logs` - recorded layer body weights with calculations

  3. Prebuilt Templates
    - General farm tasks
    - Broiler-specific tasks
    - Layer-specific tasks
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_scope') THEN
    CREATE TYPE task_scope AS ENUM ('general', 'broiler', 'layer');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type_category') THEN
    CREATE TYPE task_type_category AS ENUM ('daily', 'one_time', 'recording');
  END IF;
END $$;

ALTER TABLE task_templates
ADD COLUMN IF NOT EXISTS scope task_scope DEFAULT 'general',
ADD COLUMN IF NOT EXISTS type_category task_type_category DEFAULT 'daily',
ADD COLUMN IF NOT EXISTS is_system_template boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS flock_type_filter text DEFAULT null;

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT null,
ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES profiles(id) DEFAULT null;

CREATE TABLE IF NOT EXISTS layer_weight_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  breed_name text NOT NULL,
  week_number integer NOT NULL,
  target_weight_grams integer NOT NULL,
  tolerance_percent numeric(5,2) DEFAULT 5.0,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(breed_name, week_number)
);

ALTER TABLE layer_weight_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view weight targets" ON layer_weight_targets;
CREATE POLICY "Anyone can view weight targets"
  ON layer_weight_targets FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS layer_weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id uuid NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  recorded_date date NOT NULL,
  week_number integer NOT NULL,
  birds_weighed integer NOT NULL,
  total_weight_grams numeric(12,2) NOT NULL,
  average_body_weight numeric(10,2) GENERATED ALWAYS AS (total_weight_grams / NULLIF(birds_weighed, 0)) STORED,
  target_weight_grams integer,
  achievement_percent numeric(6,2),
  weight_status text,
  breed_name text,
  notes text,
  recorded_by uuid REFERENCES profiles(id),
  task_id uuid REFERENCES tasks(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE layer_weight_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own farm layer weight logs" ON layer_weight_logs;
CREATE POLICY "Users can view own farm layer weight logs"
  ON layer_weight_logs FOR SELECT
  TO authenticated
  USING (farm_id IN (
    SELECT fm.farm_id FROM farm_members fm WHERE fm.user_id = auth.uid() AND fm.is_active = true
  ));

DROP POLICY IF EXISTS "Users can insert layer weight logs" ON layer_weight_logs;
CREATE POLICY "Users can insert layer weight logs"
  ON layer_weight_logs FOR INSERT
  TO authenticated
  WITH CHECK (farm_id IN (
    SELECT fm.farm_id FROM farm_members fm WHERE fm.user_id = auth.uid() AND fm.is_active = true
  ));

DROP POLICY IF EXISTS "Users can update own farm layer weight logs" ON layer_weight_logs;
CREATE POLICY "Users can update own farm layer weight logs"
  ON layer_weight_logs FOR UPDATE
  TO authenticated
  USING (farm_id IN (
    SELECT fm.farm_id FROM farm_members fm WHERE fm.user_id = auth.uid() AND fm.is_active = true
  ));

INSERT INTO layer_weight_targets (breed_name, week_number, target_weight_grams, tolerance_percent) VALUES
('Generic Layer', 1, 70, 5.0),
('Generic Layer', 2, 130, 5.0),
('Generic Layer', 3, 200, 5.0),
('Generic Layer', 4, 280, 5.0),
('Generic Layer', 5, 370, 5.0),
('Generic Layer', 6, 470, 5.0),
('Generic Layer', 7, 570, 5.0),
('Generic Layer', 8, 680, 5.0),
('Generic Layer', 9, 790, 5.0),
('Generic Layer', 10, 900, 5.0),
('Generic Layer', 11, 1010, 5.0),
('Generic Layer', 12, 1120, 5.0),
('Generic Layer', 13, 1220, 5.0),
('Generic Layer', 14, 1310, 5.0),
('Generic Layer', 15, 1390, 5.0),
('Generic Layer', 16, 1460, 5.0),
('Generic Layer', 17, 1520, 5.0),
('Generic Layer', 18, 1580, 5.0),
('Generic Layer', 19, 1640, 5.0),
('Generic Layer', 20, 1700, 5.0),
('Isa Brown', 1, 75, 5.0),
('Isa Brown', 2, 140, 5.0),
('Isa Brown', 3, 220, 5.0),
('Isa Brown', 4, 310, 5.0),
('Isa Brown', 5, 410, 5.0),
('Isa Brown', 6, 520, 5.0),
('Isa Brown', 7, 630, 5.0),
('Isa Brown', 8, 750, 5.0),
('Isa Brown', 9, 870, 5.0),
('Isa Brown', 10, 990, 5.0),
('Isa Brown', 11, 1110, 5.0),
('Isa Brown', 12, 1230, 5.0),
('Isa Brown', 13, 1340, 5.0),
('Isa Brown', 14, 1440, 5.0),
('Isa Brown', 15, 1530, 5.0),
('Isa Brown', 16, 1610, 5.0),
('Isa Brown', 17, 1680, 5.0),
('Isa Brown', 18, 1740, 5.0),
('Isa Brown', 19, 1800, 5.0),
('Isa Brown', 20, 1850, 5.0),
('Lohmann Brown', 1, 72, 5.0),
('Lohmann Brown', 2, 135, 5.0),
('Lohmann Brown', 3, 210, 5.0),
('Lohmann Brown', 4, 295, 5.0),
('Lohmann Brown', 5, 390, 5.0),
('Lohmann Brown', 6, 495, 5.0),
('Lohmann Brown', 7, 600, 5.0),
('Lohmann Brown', 8, 715, 5.0),
('Lohmann Brown', 9, 830, 5.0),
('Lohmann Brown', 10, 945, 5.0),
('Lohmann Brown', 11, 1060, 5.0),
('Lohmann Brown', 12, 1175, 5.0),
('Lohmann Brown', 13, 1280, 5.0),
('Lohmann Brown', 14, 1375, 5.0),
('Lohmann Brown', 15, 1460, 5.0),
('Lohmann Brown', 16, 1535, 5.0),
('Lohmann Brown', 17, 1600, 5.0),
('Lohmann Brown', 18, 1660, 5.0),
('Lohmann Brown', 19, 1715, 5.0),
('Lohmann Brown', 20, 1770, 5.0)
ON CONFLICT (breed_name, week_number) DO NOTHING;

CREATE OR REPLACE FUNCTION calculate_layer_weight_status(
  p_average_weight numeric,
  p_target_weight integer
) RETURNS TABLE (
  achievement_percent numeric,
  weight_status text
) AS $$
DECLARE
  v_achievement numeric;
BEGIN
  IF p_target_weight IS NULL OR p_target_weight = 0 THEN
    RETURN QUERY SELECT NULL::numeric, 'unknown'::text;
    RETURN;
  END IF;

  v_achievement := (p_average_weight / p_target_weight) * 100;

  RETURN QUERY SELECT
    ROUND(v_achievement, 2),
    CASE
      WHEN v_achievement < 95 THEN 'underweight'
      WHEN v_achievement > 105 THEN 'overweight'
      ELSE 'on_target'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
