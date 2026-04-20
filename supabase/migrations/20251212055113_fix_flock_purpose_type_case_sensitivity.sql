/*
  # Fix Flock Purpose/Type Case Sensitivity

  1. Changes
    - Update trigger to handle case differences between type (text) and purpose (enum)
    - Convert capitalized values from code to lowercase for enum

  Note: Code uses 'Layer' and 'Broiler' but enum expects 'layer' and 'broiler'
*/

-- Update the sync trigger to handle case conversion
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
  
  -- Sync type to purpose (convert to lowercase for enum)
  IF NEW.type IS NOT NULL THEN
    NEW.purpose := LOWER(NEW.type)::flock_purpose;
  END IF;
  
  -- Sync purpose to type (convert to title case)
  IF NEW.purpose IS NOT NULL AND NEW.type IS NULL THEN
    NEW.type := INITCAP(NEW.purpose::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;