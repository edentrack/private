/*
  # Fix Farms Table Missing Columns

  1. Changes
    - Add currency_code (alias for currency)
    - Add eggs_per_tray
    - Add cost_per_egg_override
    - Add plan column if missing

  Note: Code expects currency_code, but table has currency
*/

-- Add currency_code if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'currency_code'
  ) THEN
    ALTER TABLE farms ADD COLUMN currency_code text;
    UPDATE farms SET currency_code = currency WHERE currency IS NOT NULL;
  END IF;
END $$;

-- Add eggs_per_tray if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'eggs_per_tray'
  ) THEN
    ALTER TABLE farms ADD COLUMN eggs_per_tray integer DEFAULT 30;
  END IF;
END $$;

-- Add cost_per_egg_override if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'cost_per_egg_override'
  ) THEN
    ALTER TABLE farms ADD COLUMN cost_per_egg_override numeric;
  END IF;
END $$;

-- Add plan if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'plan'
  ) THEN
    ALTER TABLE farms ADD COLUMN plan text DEFAULT 'basic';
  END IF;
END $$;

-- Add owner_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE farms ADD COLUMN owner_id uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Add updated_at if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE farms ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;