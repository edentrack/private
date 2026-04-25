-- Add multi-processor fields to payments table
ALTER TABLE payments
  ALTER COLUMN tx_ref DROP NOT NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS processor      TEXT DEFAULT 'flutterwave',
  ADD COLUMN IF NOT EXISTS reference      TEXT,
  ADD COLUMN IF NOT EXISTS amount_usd     DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS processor_ref  TEXT,
  ADD COLUMN IF NOT EXISTS paid_at        TIMESTAMPTZ;

-- Unique index on reference (nullable — can't use UNIQUE constraint)
CREATE UNIQUE INDEX IF NOT EXISTS payments_reference_key ON payments(reference)
  WHERE reference IS NOT NULL;

-- Expand plan CHECK to include 'industry'
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_plan_check;
ALTER TABLE payments ADD CONSTRAINT payments_plan_check
  CHECK (plan IN ('free', 'pro', 'enterprise', 'industry'));

-- Expand status CHECK to include 'completed' (used by Stripe processor)
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'successful', 'failed', 'cancelled', 'completed'));

-- Add Stripe subscription fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_period           TEXT DEFAULT 'quarterly'
    CHECK (billing_period IN ('quarterly', 'yearly'));

-- Flutterwave card tokenization (for auto-renewal)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS flw_card_token    TEXT,
  ADD COLUMN IF NOT EXISTS flw_card_last4    TEXT,
  ADD COLUMN IF NOT EXISTS flw_card_expiry   TEXT,
  ADD COLUMN IF NOT EXISTS flw_card_currency TEXT,
  ADD COLUMN IF NOT EXISTS renewal_failure_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS profiles_stripe_sub_idx ON profiles(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_stripe_cust_idx ON profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
