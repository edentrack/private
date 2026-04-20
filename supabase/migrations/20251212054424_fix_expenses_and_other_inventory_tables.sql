/*
  # Fix Expenses and Other Inventory Tables

  1. Changes to expenses table
    - Add date column (code expects this, table has incurred_on)
    - Add user_id, receipt_url, kind columns if missing

  2. Changes to other_inventory_items table
    - Add missing columns and create view for compatibility
*/

-- Fix expenses table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'date'
  ) THEN
    ALTER TABLE expenses ADD COLUMN date date;
    UPDATE expenses SET date = incurred_on WHERE incurred_on IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN user_id uuid REFERENCES auth.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'receipt_url'
  ) THEN
    ALTER TABLE expenses ADD COLUMN receipt_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'kind'
  ) THEN
    ALTER TABLE expenses ADD COLUMN kind text;
  END IF;
END $$;

-- Add missing columns to other_inventory_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'other_inventory_items' AND column_name = 'notes'
  ) THEN
    ALTER TABLE other_inventory_items ADD COLUMN notes text;
  END IF;
END $$;

-- Create a view called other_inventory that maps to other_inventory_items
DROP VIEW IF EXISTS other_inventory CASCADE;

CREATE OR REPLACE VIEW other_inventory AS
SELECT 
  id,
  farm_id,
  name as item_name,
  category,
  quantity,
  unit,
  notes,
  updated_at as last_updated,
  created_at
FROM other_inventory_items;