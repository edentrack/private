/*
  # Update Transport Category
  
  1. Changes
    - Add 'transport' to the expense_category enum type
    - Update existing 'chicks transport' expenses to 'transport' category
    - Update CHECK constraint to allow 'transport' category
    - Keep 'chicks transport' in enum for backward compatibility but use 'transport' going forward
  
  2. Notes
    - Consolidates all transportation expenses into one "Transport" category
    - Includes chicks transport, feed transport, equipment transport, etc.
    - Existing 'chicks transport' records are migrated to 'transport'
    
  3. IMPORTANT: This must be run in Supabase SQL Editor as separate commands:
      - First: Add the enum value (Step 1)
      - Then: Run the updates (Steps 2-4)
*/

-- ============================================
-- STEP 1: Add 'transport' to the enum type
-- ============================================
-- Run this FIRST in a separate transaction
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'transport' 
    AND enumtypid = 'expense_category'::regtype
  ) THEN
    ALTER TYPE expense_category ADD VALUE 'transport';
  END IF;
END $$;

-- ============================================
-- STEP 2: After committing Step 1, run these:
-- ============================================

-- Update existing 'chicks transport' expenses to 'transport'
UPDATE expenses
SET category = 'transport'::expense_category
WHERE category::text = 'chicks transport'
  OR category::text = 'Chicks Transport';

-- Update the CHECK constraint to allow 'transport' instead of 'Chicks Transport'
DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
  
  -- Add new constraint with 'transport' instead of 'Chicks Transport'
  -- Note: PostgreSQL stores enum values as they were added, but we'll allow lowercase variants
  ALTER TABLE expenses ADD CONSTRAINT expenses_category_check 
    CHECK (
      category::text IN (
        'feed', 'Feed',
        'medication', 'Medication',
        'equipment', 'Equipment',
        'labor', 'Labor',
        'chicks purchase', 'Chicks Purchase',
        'transport', 'Transport', 'chicks transport', 'Chicks Transport',
        'other', 'Other'
      )
    );
END $$;

-- Update any auto-generated transport expenses (kind='chicks_transport') to use 'transport' category
UPDATE expenses
SET category = 'transport'::expense_category
WHERE kind = 'chicks_transport'
  AND category::text != 'transport';
