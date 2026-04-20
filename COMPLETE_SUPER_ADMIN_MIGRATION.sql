/*
  # COMPLETE SUPER ADMIN MIGRATION
  =================================
  
  This is a comprehensive migration that sets up ALL Super Admin features:
  - Super Admin System (user management, pricing, approvals)
  - Impersonation System (view as user functionality)
  - Platform Settings (maintenance mode, feature flags)
  - Marketplace Suppliers (supplier management)
  - Platform Announcements (tier-based messaging)
  - Support Tickets (customer support system)
  
  Run this single file in Supabase SQL Editor to set up everything at once.
  
  This migration is IDEMPOTENT - safe to run multiple times.
*/

-- ============================================================================
-- PART 1: SUPER ADMIN SYSTEM
-- ============================================================================

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
  target_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
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

-- 6. Create helper functions
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

-- ============================================================================
-- PART 2: IMPERSONATION SYSTEM
-- ============================================================================

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

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Super admins can manage impersonation logs" ON super_admin_impersonation_logs;

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
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

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

  SELECT COUNT(*) INTO v_flocks_count
  FROM flocks
  WHERE farm_id = p_farm_id AND status = 'active';

  SELECT COUNT(*) INTO v_team_count
  FROM farm_members
  WHERE farm_id = p_farm_id AND is_active = true;

  SELECT COUNT(*) INTO v_tasks_count
  FROM tasks
  WHERE farm_id = p_farm_id
  AND created_at >= NOW() - INTERVAL '7 days';

  SELECT COALESCE(SUM(amount), 0) INTO v_expenses_total
  FROM expenses
  WHERE farm_id = p_farm_id
  AND incurred_on >= CURRENT_DATE - INTERVAL '7 days';

  SELECT COALESCE(SUM(amount), 0) INTO v_sales_total
  FROM revenues
  WHERE farm_id = p_farm_id
  AND revenue_date >= CURRENT_DATE - INTERVAL '7 days';

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
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  IF p_status NOT IN ('pending', 'active', 'suspended', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  UPDATE profiles
  SET
    account_status = p_status,
    approved_by = CASE WHEN p_status = 'active' THEN auth.uid() ELSE approved_by END,
    approved_at = CASE WHEN p_status = 'active' THEN NOW() ELSE approved_at END
  WHERE id = p_user_id;

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
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  IF p_tier NOT IN ('free', 'pro', 'enterprise') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_tier;
  END IF;

  UPDATE profiles
  SET
    subscription_tier = p_tier,
    subscription_expires_at = p_expires_at
  WHERE id = p_user_id;

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
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  UPDATE super_admin_impersonation_logs
  SET ended_at = NOW()
  WHERE admin_id = auth.uid()
  AND ended_at IS NULL;

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
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  UPDATE super_admin_impersonation_logs
  SET ended_at = NOW()
  WHERE id = p_log_id
  AND admin_id = auth.uid()
  AND ended_at IS NULL;

  INSERT INTO admin_actions (admin_id, action_type, details)
  VALUES (
    auth.uid(),
    'end_impersonation',
    jsonb_build_object('log_id', p_log_id)
  );
END;
$$;

-- Create indexes for impersonation logs
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_admin ON super_admin_impersonation_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_active ON super_admin_impersonation_logs(admin_id, ended_at) WHERE ended_at IS NULL;

-- ============================================================================
-- PART 3: PLATFORM SETTINGS
-- ============================================================================

-- Create platform_settings table
CREATE TABLE IF NOT EXISTS platform_settings (
  id TEXT PRIMARY KEY DEFAULT 'platform',
  maintenance_mode BOOLEAN DEFAULT false NOT NULL,
  maintenance_message TEXT DEFAULT 'The platform is currently under maintenance. Please check back soon.',
  app_version TEXT DEFAULT '1.0.0' NOT NULL,
  min_app_version TEXT DEFAULT '1.0.0' NOT NULL,
  feature_flags JSONB DEFAULT '{
    "ai_assistant": true,
    "smart_upload": true,
    "marketplace": true,
    "voice_commands": true,
    "weather_integration": true,
    "predictive_analytics": true
  }'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can view platform settings" ON platform_settings;
DROP POLICY IF EXISTS "Super admins can update platform settings" ON platform_settings;
DROP POLICY IF EXISTS "Super admins can insert platform settings" ON platform_settings;

-- Policy: Only super admins can read platform settings
CREATE POLICY "Super admins can view platform settings"
  ON platform_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policy: Only super admins can update platform settings
CREATE POLICY "Super admins can update platform settings"
  ON platform_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policy: Only super admins can insert platform settings
CREATE POLICY "Super admins can insert platform settings"
  ON platform_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_platform_settings_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_platform_settings_updated ON platform_settings;
CREATE TRIGGER on_platform_settings_updated
  BEFORE UPDATE ON platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_settings_timestamp();

-- Insert default settings
INSERT INTO platform_settings (id)
VALUES ('platform')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PART 4: MARKETPLACE SUPPLIERS
-- ============================================================================

-- Create marketplace_suppliers table
CREATE TABLE IF NOT EXISTS marketplace_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  business_name TEXT,
  category TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'verified')) NOT NULL,
  is_featured BOOLEAN DEFAULT false NOT NULL,
  verification_documents TEXT[],
  website_url TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE marketplace_suppliers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Suppliers can view own records" ON marketplace_suppliers;
DROP POLICY IF EXISTS "Suppliers can create own records" ON marketplace_suppliers;
DROP POLICY IF EXISTS "Suppliers can update own records" ON marketplace_suppliers;
DROP POLICY IF EXISTS "Super admins can manage all suppliers" ON marketplace_suppliers;

-- Policy: Suppliers can view their own records
CREATE POLICY "Suppliers can view own records"
  ON marketplace_suppliers
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policy: Suppliers can insert their own records
CREATE POLICY "Suppliers can create own records"
  ON marketplace_suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy: Suppliers can update their own records (but not status)
CREATE POLICY "Suppliers can update own records"
  ON marketplace_suppliers
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Super admins can manage all suppliers
CREATE POLICY "Super admins can manage all suppliers"
  ON marketplace_suppliers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Function to prevent suppliers from changing their own status
CREATE OR REPLACE FUNCTION prevent_supplier_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status != NEW.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    ) THEN
      RAISE EXCEPTION 'Only super admins can change supplier status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_supplier_status_change_trigger ON marketplace_suppliers;
CREATE TRIGGER prevent_supplier_status_change_trigger
  BEFORE UPDATE ON marketplace_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION prevent_supplier_status_change();

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_marketplace_suppliers_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_marketplace_suppliers_updated ON marketplace_suppliers;
CREATE TRIGGER on_marketplace_suppliers_updated
  BEFORE UPDATE ON marketplace_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_marketplace_suppliers_timestamp();

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_marketplace_suppliers_status ON marketplace_suppliers(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_suppliers_user_id ON marketplace_suppliers(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_suppliers_featured ON marketplace_suppliers(is_featured) WHERE is_featured = true;

-- ============================================================================
-- PART 5: PLATFORM ANNOUNCEMENTS
-- ============================================================================

-- Create platform_announcements table
CREATE TABLE IF NOT EXISTS platform_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_audience TEXT DEFAULT 'all_owners' CHECK (target_audience IN ('all_owners', 'pro_tier', 'enterprise_tier', 'free_tier', 'specific_farms')) NOT NULL,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE platform_announcements ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Super admins can manage announcements" ON platform_announcements;
DROP POLICY IF EXISTS "Users can view relevant announcements" ON platform_announcements;

-- Policy: Super admins can manage all announcements
CREATE POLICY "Super admins can manage announcements"
  ON platform_announcements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policy: Users can view announcements sent to them
CREATE POLICY "Users can view relevant announcements"
  ON platform_announcements
  FOR SELECT
  TO authenticated
  USING (
    status = 'sent' AND
    (
      target_audience = 'all_owners' OR
      (target_audience = 'pro_tier' AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.subscription_tier = 'pro'
      )) OR
      (target_audience = 'enterprise_tier' AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.subscription_tier = 'enterprise'
      )) OR
      (target_audience = 'free_tier' AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.subscription_tier = 'free'
      ))
    )
  );

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_platform_announcements_status ON platform_announcements(status);
CREATE INDEX IF NOT EXISTS idx_platform_announcements_target ON platform_announcements(target_audience);
CREATE INDEX IF NOT EXISTS idx_platform_announcements_scheduled ON platform_announcements(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- ============================================================================
-- PART 6: SUPPORT TICKETS
-- ============================================================================

-- Create support_tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')) NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')) NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create support_ticket_messages table for threaded conversations
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Users can create own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Users can update own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Super admins can manage all tickets" ON support_tickets;
DROP POLICY IF EXISTS "Users can view own ticket messages" ON support_ticket_messages;
DROP POLICY IF EXISTS "Users can add messages to own tickets" ON support_ticket_messages;

-- Policy: Users can view their own tickets
CREATE POLICY "Users can view own tickets"
  ON support_tickets
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policy: Users can create their own tickets
CREATE POLICY "Users can create own tickets"
  ON support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own open tickets
CREATE POLICY "Users can update own tickets"
  ON support_tickets
  FOR UPDATE
  TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'open') OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    (user_id = auth.uid() AND status = 'open') OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policy: Super admins can manage all tickets
CREATE POLICY "Super admins can manage all tickets"
  ON support_tickets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Policy: Users can view messages for their tickets
CREATE POLICY "Users can view own ticket messages"
  ON support_ticket_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = support_ticket_messages.ticket_id
      AND (
        support_tickets.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.is_super_admin = true
        )
      )
    )
    AND (is_internal = false OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    ))
  );

-- Policy: Users can add messages to their tickets
CREATE POLICY "Users can add messages to own tickets"
  ON support_ticket_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = support_ticket_messages.ticket_id
      AND support_tickets.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_support_tickets_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_support_tickets_updated ON support_tickets;
CREATE TRIGGER on_support_tickets_updated
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_support_tickets_timestamp();

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_id ON support_ticket_messages(ticket_id);

-- ============================================================================
-- PART 7: ADMIN DELETE USER FUNCTION
-- ============================================================================

-- Create function to safely delete users (super admin only)
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify requester is super admin
  IF NOT is_requester_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super admin privileges required';
  END IF;

  -- Prevent deleting yourself
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- Prevent deleting other super admins
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'Cannot delete super admin accounts';
  END IF;

  -- Log the action BEFORE deleting (so we can reference the user)
  INSERT INTO admin_actions (admin_id, action_type, target_user_id, details)
  VALUES (
    auth.uid(),
    'delete_user',
    p_user_id,
    jsonb_build_object('deleted_at', NOW())
  );

  -- Delete the profile (cascades to farms, flocks, etc. due to ON DELETE CASCADE)
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- All Super Admin features are now set up!
-- Don't forget to set yourself as super admin:
-- UPDATE profiles SET is_super_admin = true WHERE email = 'your-email@example.com';
