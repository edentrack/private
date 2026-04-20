/*
  # Add Inventory Effect Fields to Task Templates

  1. Schema Changes
    - Add inventory linking fields to `task_templates` table:
      - `inventory_type`: enum type for inventory category (feed, other, eggs)
      - `inventory_item_id`: UUID reference to linked inventory item
      - `inventory_effect`: enum for how task affects inventory (none, increase, decrease)
      - `inventory_unit`: text unit of measurement
  
  2. Purpose
    - Allows task templates to define their effect on inventory
    - Feed usage tasks decrease feed stock
    - Egg collection tasks increase egg inventory
    - Medicine/sawdust usage tasks decrease other inventory
    - Checklist tasks have no inventory effect
  
  3. Security
    - Maintains existing RLS policies on task_templates
    - No additional policies needed as fields are nullable
*/

-- Create enum type for inventory effect
DO $$ BEGIN
  CREATE TYPE inventory_effect_enum AS ENUM ('none', 'increase', 'decrease');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add inventory fields to task_templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'inventory_type'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN inventory_type inventory_type_enum;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'inventory_item_id'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN inventory_item_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'inventory_effect'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN inventory_effect inventory_effect_enum DEFAULT 'none';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'inventory_unit'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN inventory_unit text;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN task_templates.inventory_type IS 'Type of inventory affected: feed, other, or eggs';
COMMENT ON COLUMN task_templates.inventory_item_id IS 'ID of the specific inventory item (feed_stock.id or other_inventory.id)';
COMMENT ON COLUMN task_templates.inventory_effect IS 'How completing this task affects inventory: none, increase, or decrease';
COMMENT ON COLUMN task_templates.inventory_unit IS 'Unit of measurement for inventory changes (bags, kg, trays, liters, etc.)';

-- Create index for inventory-linked templates
CREATE INDEX IF NOT EXISTS idx_task_templates_inventory_item ON task_templates(inventory_item_id) 
WHERE inventory_item_id IS NOT NULL;
