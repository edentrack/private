/*
  # Create Missing Team Management Tables

  1. New Tables
    - team_invitations: Track pending team invitations
    - team_activity_log: Track team activity and changes
    - worker_pay_rates: Track worker compensation
    - worker_shifts: Track worker shift scheduling

  2. Security
    - Enable RLS on all tables
    - Add policies for farm owners and managers

  Note: These tables are referenced in the code but don't exist in the database
*/

-- Create team_invitations table
CREATE TABLE IF NOT EXISTS team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  role text NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  accepted boolean DEFAULT false,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farm members can view invitations"
  ON team_invitations
  FOR SELECT
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Farm owners can insert invitations"
  ON team_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'manager') 
        AND is_active = true
    )
  );

-- Create team_activity_log table
CREATE TABLE IF NOT EXISTS team_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id),
  target_user_id uuid REFERENCES auth.users(id),
  event_type text NOT NULL,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE team_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farm members can view activity log"
  ON team_activity_log
  FOR SELECT
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Farm members can insert activity log"
  ON team_activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Create worker_pay_rates table
CREATE TABLE IF NOT EXISTS worker_pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES auth.users(id),
  rate_type text NOT NULL DEFAULT 'hourly',
  rate_amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'CFA',
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE worker_pay_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farm members can view pay rates"
  ON worker_pay_rates
  FOR SELECT
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Farm owners can manage pay rates"
  ON worker_pay_rates
  FOR ALL
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'manager') 
        AND is_active = true
    )
  );

-- Create worker_shifts table
CREATE TABLE IF NOT EXISTS worker_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES auth.users(id),
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE worker_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farm members can view shifts"
  ON worker_shifts
  FOR SELECT
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Farm owners can manage shifts"
  ON worker_shifts
  FOR ALL
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() 
        AND role IN ('owner', 'manager') 
        AND is_active = true
    )
  );