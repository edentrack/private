/*
  # Create Flock Cycles Table for Per-Flock Production Week Tracking

  1. New Tables
    - `flock_cycles`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, FK to farms) - for RLS efficiency
      - `flock_id` (uuid, FK to flocks, unique - one cycle per flock)
      - `cycle_name` (text, default "Main Cycle")
      - `start_date` (date, required) - when the production cycle started
      - `week_length_days` (int, default 7) - days per week
      - `target_weeks` (int, nullable) - optional target like 72 weeks for layers
      - `manual_week_override` (int, nullable) - manual week number override
      - `created_by` (uuid, FK to auth.users)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Indexes
    - Unique constraint on flock_id (one cycle per flock)
    - Index on farm_id for efficient queries
    - Index on flock_id for lookups

  3. Security
    - Enable RLS on `flock_cycles` table
    - Farm members can SELECT their farm's flock cycles
    - Only owner/manager can INSERT/UPDATE
    - Only owner can DELETE

  4. Notes
    - This replaces farm_cycles as the source of truth
    - farm_cycles table is kept for backward compatibility but deprecated
*/

-- Create flock_cycles table
CREATE TABLE IF NOT EXISTS flock_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id uuid NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  cycle_name text DEFAULT 'Main Cycle',
  start_date date NOT NULL,
  week_length_days int NOT NULL DEFAULT 7 CHECK (week_length_days > 0),
  target_weeks int CHECK (target_weeks IS NULL OR target_weeks > 0),
  manual_week_override int CHECK (manual_week_override IS NULL OR manual_week_override > 0),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(flock_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_flock_cycles_farm_id ON flock_cycles(farm_id);
CREATE INDEX IF NOT EXISTS idx_flock_cycles_flock_id ON flock_cycles(flock_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_flock_cycles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS flock_cycles_updated_at ON flock_cycles;
CREATE TRIGGER flock_cycles_updated_at
  BEFORE UPDATE ON flock_cycles
  FOR EACH ROW
  EXECUTE FUNCTION update_flock_cycles_updated_at();

-- Enable RLS
ALTER TABLE flock_cycles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for flock_cycles

-- Farm members can view their farm's flock cycles
CREATE POLICY "Farm members can view flock cycles"
  ON flock_cycles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = flock_cycles.farm_id
        AND farm_members.user_id = auth.uid()
        AND farm_members.is_active = true
    )
  );

-- Owner/Manager can insert flock cycle
CREATE POLICY "Owner/Manager can create flock cycle"
  ON flock_cycles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_farm_owner_or_manager(farm_id)
  );

-- Owner/Manager can update flock cycle
CREATE POLICY "Owner/Manager can update flock cycle"
  ON flock_cycles
  FOR UPDATE
  TO authenticated
  USING (
    is_farm_owner_or_manager(farm_id)
  )
  WITH CHECK (
    is_farm_owner_or_manager(farm_id)
  );

-- Only owner can delete flock cycle
CREATE POLICY "Owner can delete flock cycle"
  ON flock_cycles
  FOR DELETE
  TO authenticated
  USING (
    is_farm_owner(farm_id)
  );