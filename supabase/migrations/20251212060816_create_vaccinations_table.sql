/*
  # Create Vaccinations Table

  1. New Table
    - `vaccinations` - Track vaccination schedules and records

  2. Security
    - Enable RLS with farm-based access
*/

CREATE TABLE IF NOT EXISTS vaccinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id uuid NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  vaccine_name text NOT NULL,
  scheduled_date date NOT NULL,
  administered_date date,
  dosage text,
  notes text,
  completed boolean DEFAULT false,
  administered_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vaccinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage vaccinations"
  ON vaccinations FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

CREATE INDEX IF NOT EXISTS idx_vaccinations_farm_id ON vaccinations(farm_id);
CREATE INDEX IF NOT EXISTS idx_vaccinations_flock_id ON vaccinations(flock_id);
CREATE INDEX IF NOT EXISTS idx_vaccinations_scheduled_date ON vaccinations(scheduled_date);