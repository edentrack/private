/*
  # Fix Other Inventory View for Backward Compatibility
  
  1. Changes
    - Drop existing `other_inventory` view
    - Recreate `other_inventory` view that maps to `other_inventory_items`
    - This provides backward compatibility for existing frontend code
  
  2. Purpose
    - Allow frontend code to continue using `other_inventory` references
    - Maps old table name to new `other_inventory_items` table
*/

DROP VIEW IF EXISTS other_inventory;

CREATE OR REPLACE VIEW other_inventory AS
SELECT 
  id,
  farm_id,
  name AS item_name,
  category,
  unit,
  quantity,
  notes,
  created_at,
  updated_at
FROM other_inventory_items;
