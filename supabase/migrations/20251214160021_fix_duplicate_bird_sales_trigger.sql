/*
  # Fix Duplicate Bird Sales Trigger Issue

  ## Problem
  Two triggers were firing on bird_sales INSERT:
  - `trg_update_flock_count_on_bird_sale` (old/orphaned trigger)
  - `trigger_update_flock_count_on_sale` (current trigger)
  
  This caused birds_sold to be subtracted from current_count TWICE.

  ## Changes
  1. Drop the duplicate/orphaned trigger
  2. Fix the current_count for affected flocks by adding back the incorrectly subtracted amount
  
  ## Details
  - The correct trigger is `trigger_update_flock_count_on_sale`
  - Remove the old `trg_update_flock_count_on_bird_sale` trigger
  - Also remove the old DELETE trigger if it exists
  - For each flock with bird_sales, add back the total birds_sold to fix the count
*/

-- Drop the duplicate/orphaned triggers
DROP TRIGGER IF EXISTS trg_update_flock_count_on_bird_sale ON bird_sales;
DROP TRIGGER IF EXISTS trg_reverse_flock_count_on_bird_sale_delete ON bird_sales;

-- Fix the current_count for flocks that have been affected
-- Add back the incorrectly subtracted birds_sold amount
DO $$
DECLARE
  flock_record RECORD;
  total_sold INTEGER;
BEGIN
  FOR flock_record IN 
    SELECT DISTINCT f.id, f.current_count
    FROM flocks f
    INNER JOIN bird_sales bs ON bs.flock_id = f.id
  LOOP
    -- Calculate total birds sold for this flock
    SELECT COALESCE(SUM(birds_sold), 0) INTO total_sold
    FROM bird_sales
    WHERE flock_id = flock_record.id;
    
    -- Add back the incorrectly subtracted amount (since it was subtracted twice, we add it back once)
    UPDATE flocks
    SET current_count = current_count + total_sold,
        current_bird_count = current_bird_count + total_sold,
        updated_at = now()
    WHERE id = flock_record.id;
  END LOOP;
END $$;
