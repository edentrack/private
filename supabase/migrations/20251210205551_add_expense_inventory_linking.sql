/*
  # Add Expense-Inventory Linking

  1. Schema Changes
    - Add inventory linking fields to `expenses` table:
      - `inventory_link_type`: enum type for linking category (none, feed, or other)
      - `inventory_item_id`: UUID reference to linked inventory item
      - `inventory_quantity`: numeric quantity purchased
      - `inventory_unit`: text unit of measurement
  
  2. New Features
    - Links expense records to inventory items
    - Tracks quantity and units for inventory purchases
    - Enables automatic inventory stock updates when expenses are created
  
  3. Security
    - Maintains existing RLS policies on expenses table
    - No additional policies needed as fields are nullable
*/

-- Create enum type for inventory link type
DO $$ BEGIN
  CREATE TYPE inventory_link_type AS ENUM ('none', 'feed', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add inventory linking fields to expenses table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'inventory_link_type'
  ) THEN
    ALTER TABLE expenses ADD COLUMN inventory_link_type inventory_link_type DEFAULT 'none';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'inventory_item_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN inventory_item_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'inventory_quantity'
  ) THEN
    ALTER TABLE expenses ADD COLUMN inventory_quantity numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'inventory_unit'
  ) THEN
    ALTER TABLE expenses ADD COLUMN inventory_unit text;
  END IF;
END $$;

-- Create index for efficient inventory item lookups
CREATE INDEX IF NOT EXISTS idx_expenses_inventory_item ON expenses(inventory_item_id) 
WHERE inventory_item_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN expenses.inventory_link_type IS 'Type of inventory item linked to this expense (none, feed, or other)';
COMMENT ON COLUMN expenses.inventory_item_id IS 'UUID reference to feed_stock.id or other_inventory.id';
COMMENT ON COLUMN expenses.inventory_quantity IS 'Quantity of inventory item purchased';
COMMENT ON COLUMN expenses.inventory_unit IS 'Unit of measurement (e.g., bags, kg, bottles)';
