/*
  # Super Admin System for EDENTRACK

  ## Overview
  Complete super admin infrastructure for platform management, user approvals, and pricing control.

  ## Changes

  ### 1. Profile Updates
    - Add `is_super_admin` flag to identify platform administrators
    - Add `account_status` to track user approval state (pending/active/suspended/rejected)
    - Add `subscription_tier` to manage user pricing plans
    - Add `subscription_expires_at` for subscription tracking
    - Add `approved_by` and `approved_at` for audit trail

  ### 2. New Tables
    - `subscription_tiers` - Manage pricing plans and limits
    - `admin_actions` - Log all admin actions for audit trail
    - `platform_stats` - Daily platform analytics

  ### 3. Security
    - RLS policies for super admin access
    - Audit logging for all admin actions
    - Secure approval workflow

  ### 4. Default Data
    - Three subscription tiers: free, pro, enterprise
*/

-- 1. Add super admin columns to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active' CHECK (account_status IN ('pending', 'active', 'suspended', 'rejected')),
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- 2. Create subscription_tiers table
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_yearly DECIMAL(10,2) DEFAULT 0,
  max_flocks INTEGER DEFAULT 999,
  max_team_members INTEGER DEFAULT 5,
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on subscription_tiers
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all tiers" ON subscription_tiers;
DROP POLICY IF EXISTS "Super admins can manage tiers" ON subscription_tiers;

-- Super admins can manage tiers
CREATE POLICY "Super admins can view all tiers"
  ON subscription_tiers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can manage tiers"
  ON subscription_tiers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Insert default subscription tiers
INSERT INTO subscription_tiers (name, price_monthly, price_yearly, max_flocks, max_team_members, features)
VALUES
  ('free', 0, 0, 2, 1, '{"basic_reports": true, "email_support": false, "whatsapp_reports": false}'::jsonb),
  ('pro', 10, 100, 999, 5, '{"basic_reports": true, "advanced_reports": true, "email_support": true, "whatsapp_reports": true}'::jsonb),
  ('enterprise', 30, 300, 9999, 999, '{"basic_reports": true, "advanced_reports": true, "priority_support": true, "whatsapp_reports": true, "api_access": true}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- 3. Create admin_actions log table
CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES profiles(id) NOT NULL,
  action_type TEXT NOT NULL,
  target_user_id UUID REFERENCES profiles(id),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on admin_actions
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view all actions" ON admin_actions;
DROP POLICY IF EXISTS "Super admins can log actions" ON admin_actions;

-- Super admins can view all actions
CREATE POLICY "Super admins can view all actions"
  ON admin_actions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Super admins can insert actions
CREATE POLICY "Super admins can log actions"
  ON admin_actions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- 4. Create platform_stats table
CREATE TABLE IF NOT EXISTS platform_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  total_users INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  pending_approvals INTEGER DEFAULT 0,
  total_farms INTEGER DEFAULT 0,
  total_flocks INTEGER DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on platform_stats
ALTER TABLE platform_stats ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Super admins can view platform stats" ON platform_stats;

-- Super admins can view stats
CREATE POLICY "Super admins can view platform stats"
  ON platform_stats FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- 5. Update profiles RLS policies for super admin access
-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Super admins can update all profiles" ON profiles;

-- Allow super admins to view all profiles
CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_super_admin = true
    )
  );

-- Allow super admins to update any profile
CREATE POLICY "Super admins can update all profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_super_admin = true
    )
  );

-- 6. Create helper function to check super admin status
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
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

-- 7. Create function to get pending users count
CREATE OR REPLACE FUNCTION get_pending_users_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO count
  FROM profiles
  WHERE account_status = 'pending';

  RETURN count;
END;
$$;
