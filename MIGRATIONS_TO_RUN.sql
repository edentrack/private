-- ================================================================
-- MIGRATION 1: Marketplace Suppliers Table
-- ================================================================
-- Run this FIRST in Supabase SQL Editor
-- ================================================================

/*
  # Create Marketplace Suppliers Table

  ## Overview
  Manages marketplace supplier registrations, approvals, and verification.

  ## Tables
    - `marketplace_suppliers` - Supplier information and status

  ## Security
    - RLS enabled
    - Suppliers can view their own records
    - Super admins can manage all suppliers
*/

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

-- Function to prevent suppliers from changing their own status
CREATE OR REPLACE FUNCTION prevent_supplier_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If status is changing and user is not super admin, prevent it
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

-- Create trigger to enforce status change restriction
CREATE TRIGGER prevent_supplier_status_change_trigger
  BEFORE UPDATE ON marketplace_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION prevent_supplier_status_change();

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

CREATE TRIGGER on_marketplace_suppliers_updated
  BEFORE UPDATE ON marketplace_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_marketplace_suppliers_timestamp();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_marketplace_suppliers_status ON marketplace_suppliers(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_suppliers_user_id ON marketplace_suppliers(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_suppliers_featured ON marketplace_suppliers(is_featured) WHERE is_featured = true;

-- ================================================================
-- MIGRATION 2: Platform Announcements Table
-- ================================================================
-- Run this SECOND in Supabase SQL Editor
-- ================================================================

/*
  # Create Platform Announcements Table

  ## Overview
  Manages platform-wide announcements sent to users based on subscription tiers.

  ## Tables
    - `platform_announcements` - Announcement messages and scheduling

  ## Security
    - RLS enabled
    - Only super admins can create/manage announcements
    - Users can view announcements sent to them
*/

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

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_platform_announcements_status ON platform_announcements(status);
CREATE INDEX IF NOT EXISTS idx_platform_announcements_target ON platform_announcements(target_audience);
CREATE INDEX IF NOT EXISTS idx_platform_announcements_scheduled ON platform_announcements(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- ================================================================
-- MIGRATION 3: Support Tickets Table
-- ================================================================
-- Run this THIRD in Supabase SQL Editor
-- ================================================================

/*
  # Create Support Tickets Table

  ## Overview
  Manages customer support tickets and their resolution.

  ## Tables
    - `support_tickets` - Support ticket information
    - `support_ticket_messages` - Thread of messages for each ticket

  ## Security
    - RLS enabled
    - Users can view/create their own tickets
    - Super admins can view/manage all tickets
*/

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
  is_internal BOOLEAN DEFAULT false NOT NULL, -- Internal notes only visible to admins
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

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

CREATE TRIGGER on_support_tickets_updated
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_support_tickets_timestamp();

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_id ON support_ticket_messages(ticket_id);

-- ================================================================
-- ALL MIGRATIONS COMPLETE!
-- ================================================================
-- After running all 3 migrations:
-- 1. Refresh your browser
-- 2. Marketplace Admin should work
-- 3. Announcements should work
-- 4. Support Tickets should work
-- ================================================================












