/*
  # Super Admin Impersonation System

  1. New Tables
    - `super_admin_impersonation_logs`
      - `id` (uuid, primary key)
      - `admin_id` (uuid, references profiles)
      - `target_user_id` (uuid, references profiles)
      - `target_farm_id` (uuid, references farms)
      - `started_at` (timestamptz)
      - `ended_at` (timestamptz, nullable)
      - `reason` (text, nullable)

  2. Security
    - Enable RLS on impersonation logs
    - Only super admins can access their logs

  3. Helper Function
    - `is_requester_super_admin()` - Check if current user is super admin

  4. Admin RPC Functions (SECURITY DEFINER)
    - `admin_list_users` - List all users with search
    - `admin_list_farms` - List all farms with owner info
    - `admin_get_farm_snapshot` - Get farm overview data
    - `admin_set_user_status` - Update user account status
    - `admin_set_user_tier` - Update user subscription tier
    - `admin_start_impersonation` - Start viewing as another user
    - `admin_end_impersonation` - End impersonation session
*/

-- Create impersonation logs table
CREATE TABLE IF NOT EXISTS super_admin_impersonation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  target_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  target_farm_id uuid REFERENCES farms(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now() NOT NULL,
  ended_at timestamptz,
  reason text
);

-- Enable RLS
ALTER TABLE super_admin_impersonation_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Super admins can access all logs
CREATE POLICY "Super admins can manage impersonation logs"
  ON super_admin_impersonation_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Helper function: Check if requester is super admin
CREATE OR REPLACE FUNCTION is_requester_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_super_admin = true
  );
END;
$$;

-- RPC: List all users (super admin only)
CREATE OR REPLACE FUNCTION admin_list_users(search text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  account_status text,
  subscription_tier text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify requester is super admin
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.account_status,
    p.subscription_tier,
    p.created_at,
    au.last_sign_in_at
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE
    search IS NULL OR
    p.email ILIKE '%' || search || '%' OR
    p.full_name ILIKE '%' || search || '%'
  ORDER BY p.created_at DESC;
END;
$$;

-- RPC: List all farms (super admin only)
CREATE OR REPLACE FUNCTION admin_list_farms(search text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  owner_id uuid,
  owner_email text,
  owner_name text,
  created_at timestamptz,
  plan text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify requester is super admin
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  RETURN QUERY
  SELECT
    f.id,
    f.name,
    f.owner_id,
    p.email as owner_email,
    p.full_name as owner_name,
    f.created_at,
    f.plan
  FROM farms f
  LEFT JOIN profiles p ON p.id = f.owner_id
  WHERE
    search IS NULL OR
    f.name ILIKE '%' || search || '%' OR
    p.email ILIKE '%' || search || '%' OR
    p.full_name ILIKE '%' || search || '%'
  ORDER BY f.created_at DESC;
END;
$$;

-- RPC: Get farm snapshot (super admin only)
CREATE OR REPLACE FUNCTION admin_get_farm_snapshot(p_farm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_farm_data jsonb;
  v_flocks_count int;
  v_team_count int;
  v_tasks_count int;
  v_expenses_total numeric;
  v_sales_total numeric;
BEGIN
  -- Verify requester is super admin
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  -- Get farm details
  SELECT jsonb_build_object(
    'id', f.id,
    'name', f.name,
    'owner_id', f.owner_id,
    'owner_email', p.email,
    'owner_name', p.full_name,
    'created_at', f.created_at,
    'plan', f.plan,
    'currency', f.currency
  ) INTO v_farm_data
  FROM farms f
  LEFT JOIN profiles p ON p.id = f.owner_id
  WHERE f.id = p_farm_id;

  -- Count flocks
  SELECT COUNT(*) INTO v_flocks_count
  FROM flocks
  WHERE farm_id = p_farm_id AND status = 'active';

  -- Count team members
  SELECT COUNT(*) INTO v_team_count
  FROM farm_members
  WHERE farm_id = p_farm_id AND is_active = true;

  -- Count recent tasks (last 7 days)
  SELECT COUNT(*) INTO v_tasks_count
  FROM tasks
  WHERE farm_id = p_farm_id
  AND created_at >= NOW() - INTERVAL '7 days';

  -- Sum expenses (last 7 days)
  SELECT COALESCE(SUM(amount), 0) INTO v_expenses_total
  FROM expenses
  WHERE farm_id = p_farm_id
  AND incurred_on >= CURRENT_DATE - INTERVAL '7 days';

  -- Sum sales (last 7 days)
  SELECT COALESCE(SUM(amount), 0) INTO v_sales_total
  FROM revenues
  WHERE farm_id = p_farm_id
  AND revenue_date >= CURRENT_DATE - INTERVAL '7 days';

  -- Build result
  v_result := v_farm_data || jsonb_build_object(
    'flocks_count', v_flocks_count,
    'team_members_count', v_team_count,
    'recent_tasks_count', v_tasks_count,
    'expenses_last_7d', v_expenses_total,
    'sales_last_7d', v_sales_total
  );

  RETURN v_result;
END;
$$;

-- RPC: Set user account status (super admin only)
CREATE OR REPLACE FUNCTION admin_set_user_status(
  p_user_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify requester is super admin
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  -- Validate status
  IF p_status NOT IN ('pending', 'active', 'suspended', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  -- Update user status
  UPDATE profiles
  SET
    account_status = p_status,
    approved_by = CASE WHEN p_status = 'active' THEN auth.uid() ELSE approved_by END,
    approved_at = CASE WHEN p_status = 'active' THEN NOW() ELSE approved_at END
  WHERE id = p_user_id;

  -- Log action
  INSERT INTO admin_actions (admin_id, action_type, target_user_id, details)
  VALUES (
    auth.uid(),
    'set_user_status',
    p_user_id,
    jsonb_build_object('new_status', p_status)
  );
END;
$$;

-- RPC: Set user subscription tier (super admin only)
CREATE OR REPLACE FUNCTION admin_set_user_tier(
  p_user_id uuid,
  p_tier text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify requester is super admin
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  -- Validate tier
  IF p_tier NOT IN ('free', 'pro', 'enterprise') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_tier;
  END IF;

  -- Update user tier
  UPDATE profiles
  SET
    subscription_tier = p_tier,
    subscription_expires_at = p_expires_at
  WHERE id = p_user_id;

  -- Log action
  INSERT INTO admin_actions (admin_id, action_type, target_user_id, details)
  VALUES (
    auth.uid(),
    'set_user_tier',
    p_user_id,
    jsonb_build_object('new_tier', p_tier, 'expires_at', p_expires_at)
  );
END;
$$;

-- RPC: Start impersonation (super admin only)
CREATE OR REPLACE FUNCTION admin_start_impersonation(
  p_target_user_id uuid,
  p_target_farm_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  -- Verify requester is super admin
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  -- End any active impersonation sessions for this admin
  UPDATE super_admin_impersonation_logs
  SET ended_at = NOW()
  WHERE admin_id = auth.uid()
  AND ended_at IS NULL;

  -- Create new impersonation log
  INSERT INTO super_admin_impersonation_logs (
    admin_id,
    target_user_id,
    target_farm_id,
    reason
  ) VALUES (
    auth.uid(),
    p_target_user_id,
    p_target_farm_id,
    p_reason
  ) RETURNING id INTO v_log_id;

  -- Log action
  INSERT INTO admin_actions (admin_id, action_type, target_user_id, details)
  VALUES (
    auth.uid(),
    'start_impersonation',
    p_target_user_id,
    jsonb_build_object(
      'farm_id', p_target_farm_id,
      'reason', p_reason,
      'log_id', v_log_id
    )
  );

  RETURN v_log_id;
END;
$$;

-- RPC: End impersonation (super admin only)
CREATE OR REPLACE FUNCTION admin_end_impersonation(p_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify requester is super admin
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  -- End impersonation session
  UPDATE super_admin_impersonation_logs
  SET ended_at = NOW()
  WHERE id = p_log_id
  AND admin_id = auth.uid()
  AND ended_at IS NULL;

  -- Log action
  INSERT INTO admin_actions (admin_id, action_type, details)
  VALUES (
    auth.uid(),
    'end_impersonation',
    jsonb_build_object('log_id', p_log_id)
  );
END;
$$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_admin ON super_admin_impersonation_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_active ON super_admin_impersonation_logs(admin_id, ended_at) WHERE ended_at IS NULL;
