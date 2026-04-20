/*
  # Add Plan Field to Farms Table

  1. Schema Changes
    - Add `plan` field to `farms` table:
      - `plan` (enum: basic, pro, enterprise)
      - Defaults to 'basic' for all farms
  
  2. Purpose
    - Enables plan-based feature gating
    - Basic: Core functionality only
    - Pro: Advanced analytics, KPIs, alerts
    - Enterprise: All features plus priority support
  
  3. Security
    - Maintains existing RLS policies on farms table
    - No additional policies needed
*/

-- Create enum type for farm plans
DO $$ BEGIN
  CREATE TYPE farm_plan AS ENUM ('basic', 'pro', 'enterprise');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add plan field to farms
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'plan'
  ) THEN
    ALTER TABLE farms ADD COLUMN plan farm_plan DEFAULT 'basic';
  END IF;
END $$;

-- Set existing farms to basic plan
UPDATE farms SET plan = 'basic' WHERE plan IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN farms.plan IS 'Subscription plan: basic (core features), pro (analytics + alerts), enterprise (all features)';
