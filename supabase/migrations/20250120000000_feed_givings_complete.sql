/*
  # Complete Feed Givings Tracking System
  
  This migration:
  1. Creates the feed_givings table to track when feed is given to buckets
  2. Backfills historical data from expenses (assuming all past feed purchases were given to buckets)
  
  This allows the system to:
  - Track feed usage patterns
  - Calculate daily usage averages
  - Predict when feed will run out
  - Estimate next feeding dates
*/

-- ============================================
-- PART 1: Create feed_givings table
-- ============================================

-- Drop existing policies first (in case table already exists from previous migration)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feed_givings') THEN
    DROP POLICY IF EXISTS "Users can view feed givings in their farm" ON feed_givings;
    DROP POLICY IF EXISTS "Users can view feed givings for their farms" ON feed_givings;
    DROP POLICY IF EXISTS "Users can insert feed givings in their farm" ON feed_givings;
    DROP POLICY IF EXISTS "Users can insert feed_givings for their farms" ON feed_givings;
    DROP POLICY IF EXISTS "Users can update feed givings in their farm" ON feed_givings;
    DROP POLICY IF EXISTS "Users can update feed_givings for their farms" ON feed_givings;
    DROP POLICY IF EXISTS "Users can delete feed givings in their farm" ON feed_givings;
    DROP POLICY IF EXISTS "Users can delete feed_givings for their farms" ON feed_givings;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS feed_givings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  feed_type_id uuid REFERENCES feed_types(id) ON DELETE CASCADE NOT NULL,
  quantity_given numeric(10,2) NOT NULL CHECK (quantity_given > 0),
  given_at timestamptz DEFAULT now() NOT NULL,
  recorded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_feed_givings_farm ON feed_givings(farm_id);
CREATE INDEX IF NOT EXISTS idx_feed_givings_feed_type ON feed_givings(feed_type_id);
CREATE INDEX IF NOT EXISTS idx_feed_givings_given_at ON feed_givings(given_at);

-- Enable Row Level Security
ALTER TABLE feed_givings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view feed_givings for farms they're members of
CREATE POLICY "Users can view feed givings in their farm"
  ON feed_givings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = feed_givings.farm_id
        AND farm_members.user_id = auth.uid()
        AND farm_members.is_active = true
    )
  );

-- Users can insert feed_givings for farms they're members of
CREATE POLICY "Users can insert feed givings in their farm"
  ON feed_givings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = feed_givings.farm_id
        AND farm_members.user_id = auth.uid()
        AND farm_members.is_active = true
    )
  );

-- Users can update feed_givings for farms they're members of
CREATE POLICY "Users can update feed givings in their farm"
  ON feed_givings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = feed_givings.farm_id
        AND farm_members.user_id = auth.uid()
        AND farm_members.is_active = true
    )
  );

-- Users can delete feed_givings for farms they're members of
CREATE POLICY "Users can delete feed givings in their farm"
  ON feed_givings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = feed_givings.farm_id
        AND farm_members.user_id = auth.uid()
        AND farm_members.is_active = true
    )
  );

-- Add comments for documentation
COMMENT ON TABLE feed_givings IS 'Tracks when feed is given to buckets, enabling usage pattern analysis and predictions';
COMMENT ON COLUMN feed_givings.quantity_given IS 'Amount of feed given (in the feed type unit, typically bags)';
COMMENT ON COLUMN feed_givings.given_at IS 'When the feed was given to the buckets';
COMMENT ON COLUMN feed_givings.recorded_by IS 'User who recorded this feed giving';

-- ============================================
-- PART 2: Backfill historical data from expenses
-- ============================================

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
      e.user_id,
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
        (LOWER(e.category::text) = 'feed')
        OR
        -- Any expense with 'feed' in description (case-insensitive)
        (e.description IS NOT NULL AND (
          LOWER(e.description) LIKE '%feed%' OR 
          LOWER(e.description) LIKE '%grower%' OR 
          LOWER(e.description) LIKE '%layer%' OR 
          LOWER(e.description) LIKE '%starter%' OR 
          LOWER(e.description) LIKE '%finisher%'
        ))
      )
    ORDER BY COALESCE(e.incurred_on, e.date) ASC
  LOOP
    -- Reset feed_type_id for each expense
    feed_type_id_val := NULL;
    
    -- Try to find the feed_type_id from the inventory_item_id
    -- Method 1: Check feed_inventory (new table structure)
    SELECT fi.feed_type_id INTO feed_type_id_val
    FROM feed_inventory fi
    WHERE fi.id = expense_record.inventory_item_id
      AND fi.farm_id = expense_record.farm_id
    LIMIT 1;
    
    -- Method 2: Check feed_stock (old table structure)
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
          expense_record.user_id,
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
