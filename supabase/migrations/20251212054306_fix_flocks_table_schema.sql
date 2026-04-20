/*
  # Fix Flocks Table Schema

  1. Changes
    - Add missing columns that code expects: type, arrival_date, initial_count, current_count, purchase_price_per_bird, purchase_transport_cost, user_id, sale_price, sale_buyer, final_bird_count, archived_by, updated_at
    - Map existing columns to new names or add new columns as needed

  Note: Current schema has purpose, initial_bird_count, current_bird_count
        Code expects type, initial_count, current_count
*/

-- Add user_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE flocks ADD COLUMN user_id uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Add type column (alias for purpose)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'type'
  ) THEN
    ALTER TABLE flocks ADD COLUMN type text;
    UPDATE flocks SET type = purpose WHERE purpose IS NOT NULL;
  END IF;
END $$;

-- Add arrival_date if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'arrival_date'
  ) THEN
    ALTER TABLE flocks ADD COLUMN arrival_date date DEFAULT CURRENT_DATE;
    UPDATE flocks SET arrival_date = start_date WHERE arrival_date IS NULL;
  END IF;
END $$;

-- Add initial_count (alias for initial_bird_count)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'initial_count'
  ) THEN
    ALTER TABLE flocks ADD COLUMN initial_count integer;
    UPDATE flocks SET initial_count = initial_bird_count WHERE initial_bird_count IS NOT NULL;
  END IF;
END $$;

-- Add current_count (alias for current_bird_count)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'current_count'
  ) THEN
    ALTER TABLE flocks ADD COLUMN current_count integer;
    UPDATE flocks SET current_count = current_bird_count WHERE current_bird_count IS NOT NULL;
  END IF;
END $$;

-- Add purchase_price_per_bird
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'purchase_price_per_bird'
  ) THEN
    ALTER TABLE flocks ADD COLUMN purchase_price_per_bird numeric DEFAULT 0;
  END IF;
END $$;

-- Add purchase_transport_cost
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'purchase_transport_cost'
  ) THEN
    ALTER TABLE flocks ADD COLUMN purchase_transport_cost numeric DEFAULT 0;
  END IF;
END $$;

-- Add sale_price
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'sale_price'
  ) THEN
    ALTER TABLE flocks ADD COLUMN sale_price numeric;
  END IF;
END $$;

-- Add sale_buyer
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'sale_buyer'
  ) THEN
    ALTER TABLE flocks ADD COLUMN sale_buyer text;
  END IF;
END $$;

-- Add final_bird_count
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'final_bird_count'
  ) THEN
    ALTER TABLE flocks ADD COLUMN final_bird_count integer;
  END IF;
END $$;

-- Add archived_by
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'archived_by'
  ) THEN
    ALTER TABLE flocks ADD COLUMN archived_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Add updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE flocks ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;