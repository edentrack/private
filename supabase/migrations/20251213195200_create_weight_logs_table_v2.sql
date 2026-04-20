/*
  # Create Weight Logs Table for Broiler Tracking

  1. New Tables
    - `weight_logs`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, foreign key to farms)
      - `flock_id` (uuid, foreign key to flocks)
      - `weight_kg` (numeric, average weight per bird in kg)
      - `sample_size` (integer, number of birds sampled)
      - `date` (date, when the weight was recorded)
      - `notes` (text, optional notes)
      - `recorded_by` (uuid, user who recorded)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `weight_logs` table
    - Add policies for farm members to manage weight logs
    
  3. Purpose
    - Track average bird weight for broiler flocks
    - Used for market readiness and FCR calculations
*/

CREATE TABLE IF NOT EXISTS weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id uuid NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  weight_kg numeric(6,3) NOT NULL CHECK (weight_kg > 0),
  sample_size integer DEFAULT 10 CHECK (sample_size > 0),
  date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weight_logs_farm_id ON weight_logs(farm_id);
CREATE INDEX IF NOT EXISTS idx_weight_logs_flock_id ON weight_logs(flock_id);
CREATE INDEX IF NOT EXISTS idx_weight_logs_date ON weight_logs(date);

ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farm members can view weight logs"
  ON weight_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = weight_logs.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Farm members can insert weight logs"
  ON weight_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = weight_logs.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Farm members can update own weight logs"
  ON weight_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = weight_logs.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = weight_logs.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Farm owners and managers can delete weight logs"
  ON weight_logs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = weight_logs.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
      AND farm_members.role IN ('owner', 'manager')
    )
  );
