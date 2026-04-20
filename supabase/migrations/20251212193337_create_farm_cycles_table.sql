/*
  # Create Farm Cycles Table for Production Week Tracking

  1. New Tables
    - `farm_cycles`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, FK to farms, unique - one cycle per farm)
      - `cycle_name` (text, default "Main Cycle")
      - `start_date` (date, required) - when the production cycle started
      - `week_length_days` (int, default 7) - days per week
      - `target_weeks` (int, nullable) - optional target like 72 weeks
      - `manual_week_override` (int, nullable) - manual week number override
      - `created_by` (uuid, FK to auth.users)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `farm_cycles` table
    - Farm members can SELECT their farm's cycle
    - Only owner/manager can INSERT/UPDATE
    - Only owner can DELETE

  3. Helper Functions
    - `is_farm_owner_or_manager` - check if user has permission to edit
    - `is_farm_owner` - check if user is farm owner
*/

-- Create farm_cycles table
CREATE TABLE IF NOT EXISTS farm_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cycle_name text DEFAULT 'Main Cycle',
  start_date date NOT NULL,
  week_length_days int DEFAULT 7 CHECK (week_length_days > 0),
  target_weeks int CHECK (target_weeks IS NULL OR target_weeks > 0),
  manual_week_override int CHECK (manual_week_override IS NULL OR manual_week_override > 0),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(farm_id)
);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_farm_cycles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER farm_cycles_updated_at
  BEFORE UPDATE ON farm_cycles
  FOR EACH ROW
  EXECUTE FUNCTION update_farm_cycles_updated_at();

-- Enable RLS
ALTER TABLE farm_cycles ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is owner or manager
CREATE OR REPLACE FUNCTION is_farm_owner_or_manager(p_farm_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = p_farm_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is owner
CREATE OR REPLACE FUNCTION is_farm_owner(p_farm_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = p_farm_id
      AND user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for farm_cycles

-- Farm members can view their farm's cycle
CREATE POLICY "Farm members can view cycle"
  ON farm_cycles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = farm_cycles.farm_id
        AND farm_members.user_id = auth.uid()
        AND farm_members.is_active = true
    )
  );

-- Owner/Manager can insert cycle
CREATE POLICY "Owner/Manager can create cycle"
  ON farm_cycles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_farm_owner_or_manager(farm_id)
  );

-- Owner/Manager can update cycle
CREATE POLICY "Owner/Manager can update cycle"
  ON farm_cycles
  FOR UPDATE
  TO authenticated
  USING (
    is_farm_owner_or_manager(farm_id)
  )
  WITH CHECK (
    is_farm_owner_or_manager(farm_id)
  );

-- Only owner can delete cycle
CREATE POLICY "Owner can delete cycle"
  ON farm_cycles
  FOR DELETE
  TO authenticated
  USING (
    is_farm_owner(farm_id)
  );