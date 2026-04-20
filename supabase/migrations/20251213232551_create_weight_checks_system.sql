/*
  # Create Weight Checks System

  1. New Tables
    - `weight_checks`
      - `id` (uuid, primary key)
      - `flock_id` (uuid, references flocks)
      - `check_date` (date)
      - `birds_sampled` (integer)
      - `average_weight` (numeric)
      - `total_estimated_weight` (numeric)
      - `individual_weights` (jsonb) - Array of individual weights if entered
      - `daily_gain` (numeric) - grams per day
      - `weight_gain` (numeric) - kg since last check
      - `days_since_last_check` (integer)
      - `market_readiness_percent` (numeric)
      - `notes` (text)
      - `recorded_by` (uuid, references auth.users)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `weight_checks` table
    - Add policies for authenticated users to manage weight checks in their farm
*/

CREATE TABLE IF NOT EXISTS weight_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id uuid REFERENCES flocks(id) ON DELETE CASCADE NOT NULL,
  check_date date DEFAULT CURRENT_DATE NOT NULL,
  birds_sampled integer NOT NULL,
  average_weight numeric(10,3) NOT NULL,
  total_estimated_weight numeric(10,2),
  individual_weights jsonb,
  daily_gain numeric(10,2),
  weight_gain numeric(10,3),
  days_since_last_check integer,
  market_readiness_percent numeric(5,2),
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weight_checks_flock ON weight_checks(flock_id);
CREATE INDEX IF NOT EXISTS idx_weight_checks_date ON weight_checks(check_date);

ALTER TABLE weight_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view weight checks in their farm"
  ON weight_checks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM flocks
      JOIN farm_members ON farm_members.farm_id = flocks.farm_id
      WHERE flocks.id = weight_checks.flock_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Users can create weight checks in their farm"
  ON weight_checks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flocks
      JOIN farm_members ON farm_members.farm_id = flocks.farm_id
      WHERE flocks.id = weight_checks.flock_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
      AND farm_members.role IN ('owner', 'manager', 'worker')
    )
  );

CREATE POLICY "Users can update weight checks in their farm"
  ON weight_checks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM flocks
      JOIN farm_members ON farm_members.farm_id = flocks.farm_id
      WHERE flocks.id = weight_checks.flock_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
      AND farm_members.role IN ('owner', 'manager', 'worker')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flocks
      JOIN farm_members ON farm_members.farm_id = flocks.farm_id
      WHERE flocks.id = weight_checks.flock_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
      AND farm_members.role IN ('owner', 'manager', 'worker')
    )
  );

CREATE POLICY "Users can delete weight checks in their farm"
  ON weight_checks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM flocks
      JOIN farm_members ON farm_members.farm_id = flocks.farm_id
      WHERE flocks.id = weight_checks.flock_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
      AND farm_members.role IN ('owner', 'manager')
    )
  );
