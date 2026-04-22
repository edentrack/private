-- Update subscription tiers to new pricing model:
-- Starter (free) / Grower ($9/quarter) / Farm Boss ($21/quarter)

-- Add quarterly price column
ALTER TABLE subscription_tiers
  ADD COLUMN IF NOT EXISTS price_quarterly DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Update tiers with new quarterly pricing and display names
UPDATE subscription_tiers SET
  display_name = 'Starter',
  price_monthly = 0,
  price_quarterly = 0,
  max_flocks = 1,
  max_team_members = 0,
  features = '{"basic_tracking": true, "analytics": false, "email_reports": false, "ai_assistant": false, "smart_import": false, "team_members": false, "whatsapp_share": true}'::jsonb
WHERE name = 'free';

UPDATE subscription_tiers SET
  display_name = 'Grower',
  price_monthly = 3.00,
  price_quarterly = 9.00,
  max_flocks = 5,
  max_team_members = 2,
  features = '{"basic_tracking": true, "analytics": true, "email_reports": true, "ai_assistant": true, "ai_queries_monthly": 30, "smart_import": true, "team_members": true, "whatsapp_share": true}'::jsonb
WHERE name = 'pro';

UPDATE subscription_tiers SET
  display_name = 'Farm Boss',
  price_monthly = 7.00,
  price_quarterly = 21.00,
  max_flocks = 9999,
  max_team_members = 999,
  features = '{"basic_tracking": true, "analytics": true, "email_reports": true, "ai_assistant": true, "ai_queries_monthly": 9999, "smart_import": true, "team_members": true, "whatsapp_share": true, "priority_support": true, "benchmarking": true, "loan_report": true}'::jsonb
WHERE name = 'enterprise';

-- Create payments table to record all Flutterwave transactions
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tx_ref TEXT NOT NULL UNIQUE,
  flw_ref TEXT,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  plan TEXT NOT NULL CHECK (plan IN ('pro', 'enterprise')),
  billing_period TEXT NOT NULL DEFAULT 'quarterly' CHECK (billing_period IN ('quarterly', 'monthly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed', 'cancelled')),
  flutterwave_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Users can see their own payments
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only service role can insert/update (done via edge function)
DROP POLICY IF EXISTS "Service role manages payments" ON payments;
CREATE POLICY "Service role manages payments"
  ON payments FOR ALL
  TO service_role
  USING (true);

-- Super admins can view all payments
DROP POLICY IF EXISTS "Super admins view all payments" ON payments;
CREATE POLICY "Super admins view all payments"
  ON payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments(user_id);
CREATE INDEX IF NOT EXISTS payments_tx_ref_idx ON payments(tx_ref);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);
