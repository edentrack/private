/*
  # Create Team Activity Log Table

  1. New Tables
    - `team_activity_log`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `actor_user_id` (uuid, references auth.users) - User who performed the action
      - `target_user_id` (uuid, references auth.users) - User the action was performed on
      - `event_type` (text) - Type of event (role_changed, status_changed, member_added, etc.)
      - `details` (jsonb) - Additional details about the event
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `team_activity_log` table
    - Farm members can view activity logs for their farm
    - Only system (via RPC functions) can insert logs

  3. Indexes
    - Index on farm_id for efficient querying
    - Index on created_at for sorting
*/

-- Create team_activity_log table
CREATE TABLE IF NOT EXISTS public.team_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  target_user_id uuid REFERENCES auth.users(id),
  event_type text NOT NULL,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE team_activity_log ENABLE ROW LEVEL SECURITY;

-- Policy: Farm members can view activity logs for their farm
CREATE POLICY "Farm members can view activity logs"
  ON team_activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = team_activity_log.farm_id
      AND fm.user_id = auth.uid()
      AND fm.is_active = true
    )
  );

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_team_activity_log_farm_id ON team_activity_log(farm_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_log_created_at ON team_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_activity_log_farm_created ON team_activity_log(farm_id, created_at DESC);
