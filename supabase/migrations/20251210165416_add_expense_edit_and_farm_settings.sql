/*
  # Add Fields for All Features

  1. Changes to farms table
    - Add `country` (text) for country selection
    - Add `currency_code` (text) for currency based on country
    - Add `eggs_per_tray` (numeric) for tray calculations
    - Add `cost_per_egg_override` (numeric) for custom cost per egg

  2. Changes to flocks table
    - Add `purchase_price_per_bird` (numeric) for bird purchase cost
    - Add `purchase_transport_cost` (numeric) for transport cost

  3. Changes to revenues table
    - Add `transport_cost` (numeric) for revenue transport deductions

  4. Security
    - All changes maintain existing RLS policies
*/

-- Add fields to farms table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'country'
  ) THEN
    ALTER TABLE farms ADD COLUMN country text DEFAULT 'Cameroon';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'currency_code'
  ) THEN
    ALTER TABLE farms ADD COLUMN currency_code text DEFAULT 'XAF';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'eggs_per_tray'
  ) THEN
    ALTER TABLE farms ADD COLUMN eggs_per_tray numeric DEFAULT 30;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'farms' AND column_name = 'cost_per_egg_override'
  ) THEN
    ALTER TABLE farms ADD COLUMN cost_per_egg_override numeric;
  END IF;
END $$;

-- Add fields to flocks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'purchase_price_per_bird'
  ) THEN
    ALTER TABLE flocks ADD COLUMN purchase_price_per_bird numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'purchase_transport_cost'
  ) THEN
    ALTER TABLE flocks ADD COLUMN purchase_transport_cost numeric DEFAULT 0;
  END IF;
END $$;

-- Add fields to revenues table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenues' AND column_name = 'transport_cost'
  ) THEN
    ALTER TABLE revenues ADD COLUMN transport_cost numeric DEFAULT 0;
  END IF;
END $$;

-- Update profiles to reference farms currency_code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'country'
  ) THEN
    ALTER TABLE profiles ADD COLUMN country text;
  END IF;
END $$;
