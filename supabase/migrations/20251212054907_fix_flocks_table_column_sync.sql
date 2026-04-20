/*
  # Fix Flocks Table Column Synchronization

  1. Changes
    - Make old columns (initial_bird_count, current_bird_count) nullable to avoid NOT NULL violations
    - Add trigger to sync old and new column names automatically
    - Populate old columns from new columns where they exist

  Note: The code uses new column names (initial_count, current_count) but old columns 
        (initial_bird_count, current_bird_count) have NOT NULL constraints
*/

-- Make old columns nullable
ALTER TABLE flocks ALTER COLUMN initial_bird_count DROP NOT NULL;
ALTER TABLE flocks ALTER COLUMN current_bird_count DROP NOT NULL;

-- Sync existing data from new to old columns
UPDATE flocks 
SET initial_bird_count = initial_count 
WHERE initial_count IS NOT NULL AND initial_bird_count IS NULL;

UPDATE flocks 
SET current_bird_count = current_count 
WHERE current_count IS NOT NULL AND current_bird_count IS NULL;

-- Create a trigger function to sync column values on insert/update
CREATE OR REPLACE FUNCTION sync_flock_count_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync new columns to old columns
  IF NEW.initial_count IS NOT NULL THEN
    NEW.initial_bird_count := NEW.initial_count;
  END IF;
  
  IF NEW.current_count IS NOT NULL THEN
    NEW.current_bird_count := NEW.current_count;
  END IF;
  
  -- Sync old columns to new columns (for backwards compatibility)
  IF NEW.initial_bird_count IS NOT NULL AND NEW.initial_count IS NULL THEN
    NEW.initial_count := NEW.initial_bird_count;
  END IF;
  
  IF NEW.current_bird_count IS NOT NULL AND NEW.current_count IS NULL THEN
    NEW.current_count := NEW.current_bird_count;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists and create new one
DROP TRIGGER IF EXISTS sync_flock_counts_trigger ON flocks;

CREATE TRIGGER sync_flock_counts_trigger
  BEFORE INSERT OR UPDATE ON flocks
  FOR EACH ROW
  EXECUTE FUNCTION sync_flock_count_columns();