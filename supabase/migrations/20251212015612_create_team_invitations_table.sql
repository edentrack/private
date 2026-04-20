/*
  # Create Team Invitations Table

  1. New Tables
    - `team_invitations`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `invited_email` (text) - Email of the person being invited
      - `role` (text) - Role they will have when they join
      - `invited_by` (uuid, references auth.users) - Owner who sent the invitation
      - `accepted` (boolean) - Whether the invitation has been accepted
      - `created_at` (timestamptz)
      - `accepted_at` (timestamptz) - When the invitation was accepted

  2. Security
    - Enable RLS on `team_invitations` table
    - Farm owners can view and create invitations for their farms
    - System can update invitations (via RPC)

  3. Indexes
    - Index on invited_email for fast lookup
    - Unique constraint on farm_id + invited_email to prevent duplicate invitations

  4. Important Notes
    - When a user signs up or logs in, we check for pending invitations
    - Invitations are automatically accepted and the user is added to the farm
*/

-- Create team_invitations table
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  role text NOT NULL DEFAULT 'worker',
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  accepted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT valid_invitation_role CHECK (role IN ('owner', 'manager', 'worker', 'viewer'))
);

-- Create unique constraint to prevent duplicate invitations
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_inv_farm_email 
  ON public.team_invitations(farm_id, invited_email) 
  WHERE accepted = false;

-- Index for fast email lookup
CREATE INDEX IF NOT EXISTS idx_team_inv_email ON public.team_invitations(invited_email);

-- Index for farm lookups
CREATE INDEX IF NOT EXISTS idx_team_inv_farm_id ON public.team_invitations(farm_id);

-- Enable RLS
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Farm owners can view invitations for their farms
CREATE POLICY "Farm owners can view invitations"
  ON team_invitations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = team_invitations.farm_id
      AND fm.user_id = auth.uid()
      AND fm.role = 'owner'
      AND fm.is_active = true
    )
  );

-- Policy: Farm owners can insert invitations for their farms
CREATE POLICY "Farm owners can create invitations"
  ON team_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = team_invitations.farm_id
      AND fm.user_id = auth.uid()
      AND fm.role = 'owner'
      AND fm.is_active = true
    )
  );
