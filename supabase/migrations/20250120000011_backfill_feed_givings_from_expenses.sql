/*
  # Backfill Feed Givings from Historical Expenses
  
  This migration creates historical feed_givings records from existing expense data.
  Since feed has always been given in buckets, we can use expense records where:
  - category = 'feed' OR inventory_link_type = 'feed'
  - The expense date becomes the "given_at" date
  - The inventory_quantity becomes the "quantity_given"
  
  This allows the system to calculate daily usage patterns from historical data.
*/

-- Function to backfill feed_givings from expenses
CREATE OR REPLACE FUNCTION backfill_feed_givings_from_expenses()
RETURNS TABLE(
  inserted_count bigint,
  skipped_count bigint
) AS $$
DECLARE
  expense_record RECORD;
  feed_type_id_val uuid;
  quantity_to_use numeric;
  inserted_count_val bigint := 0;
  skipped_count_val bigint := 0;
BEGIN
  -- Loop through ALL expenses that could be feed-related
  -- For this backfill, we assume all feed expenses were given to buckets
  FOR expense_record IN
    SELECT 
      e.id,
      e.farm_id,
      e.inventory_item_id,
      e.inventory_quantity,
      e.inventory_unit,
      e.amount,
      e.incurred_on,
      e.date,
      e.created_by,
      e.description,
      e.inventory_link_type,
      e.category
    FROM expenses e
    WHERE e.farm_id IS NOT NULL
      AND (
        -- Feed expenses with inventory linking
        (e.inventory_link_type = 'feed' AND e.inventory_item_id IS NOT NULL)
        OR
        -- Feed category expenses (legacy) - assume all were given to buckets
        (LOWER(e.category) = 'feed')
        OR
        -- Any expense with 'feed' in description (case-insensitive)
        (LOWER(e.description) LIKE '%feed%' OR LOWER(e.description) LIKE '%grower%' OR LOWER(e.description) LIKE '%layer%' OR LOWER(e.description) LIKE '%starter%' OR LOWER(e.description) LIKE '%finisher%')
      )
    ORDER BY COALESCE(e.incurred_on, e.date) ASC
  LOOP
    -- Try to find the feed_type_id from the inventory_item_id
    -- Method 1: Check feed_inventory (new table structure)
    SELECT fi.feed_type_id INTO feed_type_id_val
    FROM feed_inventory fi
    WHERE fi.id = expense_record.inventory_item_id
      AND fi.farm_id = expense_record.farm_id
    LIMIT 1;
    
    -- Method 2: Check feed_stock view (which joins feed_inventory + feed_types)
    IF feed_type_id_val IS NULL THEN
      SELECT ft.id INTO feed_type_id_val
      FROM feed_stock fs
      JOIN feed_types ft ON ft.name = fs.feed_type AND ft.farm_id = expense_record.farm_id
      WHERE fs.id = expense_record.inventory_item_id
      LIMIT 1;
    END IF;
    
    -- Method 3: Try to match by name from feed_types using description
    IF feed_type_id_val IS NULL AND expense_record.description IS NOT NULL THEN
      -- Try to find feed type by matching name in description
      SELECT id INTO feed_type_id_val
      FROM feed_types
      WHERE farm_id = expense_record.farm_id
        AND (
          -- Check if any feed type name appears in the description
          LOWER(expense_record.description) LIKE '%' || LOWER(name) || '%'
          OR LOWER(name) LIKE '%' || LOWER(expense_record.description) || '%'
        )
      ORDER BY LENGTH(name) DESC -- Prefer longer/more specific names
      LIMIT 1;
    END IF;
    
    -- Method 4: If still no match, try to find the most common feed type for this farm
    IF feed_type_id_val IS NULL THEN
      SELECT id INTO feed_type_id_val
      FROM feed_types
      WHERE farm_id = expense_record.farm_id
      ORDER BY created_at ASC -- Use oldest feed type as default
      LIMIT 1;
    END IF;
    
    -- Only insert if we found a feed_type_id
    IF feed_type_id_val IS NOT NULL THEN
      -- Calculate quantity: use inventory_quantity if available, otherwise estimate from amount
      -- For this backfill, we assume all feed expenses were given to buckets
      quantity_to_use := expense_record.inventory_quantity;
      
      -- If no inventory_quantity, try to estimate from amount (rough estimate: 1 bag = 5000-10000 CFA)
      -- This is a fallback - ideally inventory_quantity should be set
      IF quantity_to_use IS NULL OR quantity_to_use = 0 THEN
        -- Very rough estimate: assume average bag price
        IF expense_record.amount > 0 THEN
          quantity_to_use := GREATEST(1, ROUND(expense_record.amount / 7500)); -- Assume ~7500 CFA per bag
        ELSE
          quantity_to_use := 1; -- Default to 1 bag if we can't estimate
        END IF;
      END IF;
      
      -- Check if this feed giving already exists (avoid duplicates)
      -- Use a more lenient check: same farm, feed_type, date (within same day)
      IF NOT EXISTS (
        SELECT 1 FROM feed_givings
        WHERE farm_id = expense_record.farm_id
          AND feed_type_id = feed_type_id_val
          AND given_at::date = COALESCE(expense_record.incurred_on, expense_record.date)::date
          AND ABS(quantity_given - quantity_to_use) < 0.1 -- Allow small differences
      ) THEN
        INSERT INTO feed_givings (
          farm_id,
          feed_type_id,
          quantity_given,
          given_at,
          recorded_by,
          notes,
          created_at
        )
        VALUES (
          expense_record.farm_id,
          feed_type_id_val,
          quantity_to_use,
          COALESCE(expense_record.incurred_on, expense_record.date),
          expense_record.created_by,
          COALESCE('Backfilled from expense: ' || expense_record.description, 'Historical feed purchase (assumed given to buckets)'),
          COALESCE(expense_record.incurred_on, expense_record.date)
        );
        
        inserted_count_val := inserted_count_val + 1;
      ELSE
        skipped_count_val := skipped_count_val + 1;
      END IF;
    ELSE
      skipped_count_val := skipped_count_val + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT inserted_count_val, skipped_count_val;
END;
$$ LANGUAGE plpgsql;

-- Run the backfill function
DO $$
DECLARE
  result RECORD;
BEGIN
  result := backfill_feed_givings_from_expenses();
  RAISE NOTICE 'Backfill completed: % records inserted, % records skipped', 
    result.inserted_count, result.skipped_count;
END $$;

-- Drop the function after use (optional - you can keep it for manual runs)
-- DROP FUNCTION IF EXISTS backfill_feed_givings_from_expenses();
