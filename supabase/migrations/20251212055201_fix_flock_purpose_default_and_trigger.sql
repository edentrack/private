/*
  # Fix Flock Purpose Default and Trigger Logic

  1. Changes
    - Make purpose nullable or allow it to be derived from type
    - Improve trigger to set purpose before NOT NULL check happens

  Note: Issue is that purpose has NOT NULL constraint but code only provides type
*/

-- Make purpose nullable so we can derive it from type
ALTER TABLE flocks ALTER COLUMN purpose DROP NOT NULL;

-- Update trigger to set purpose based on type, with better handling
CREATE OR REPLACE FUNCTION sync_flock_count_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- First handle type/purpose sync
  -- If type is provided but purpose is not, derive purpose from type
  IF NEW.type IS NOT NULL AND NEW.purpose IS NULL THEN
    NEW.purpose := LOWER(NEW.type)::flock_purpose;
  END IF;
  
  -- If purpose is provided but type is not, derive type from purpose
  IF NEW.purpose IS NOT NULL AND NEW.type IS NULL THEN
    NEW.type := INITCAP(NEW.purpose::text);
  END IF;
  
  -- If neither is provided, set defaults
  IF NEW.type IS NULL AND NEW.purpose IS NULL THEN
    NEW.purpose := 'broiler'::flock_purpose;
    NEW.type := 'Broiler';
  END IF;
  
  -- Now handle count columns sync
  IF NEW.initial_count IS NOT NULL THEN
    NEW.initial_bird_count := NEW.initial_count;
  END IF;
  
  IF NEW.current_count IS NOT NULL THEN
    NEW.current_bird_count := NEW.current_count;
  END IF;
  
  IF NEW.initial_bird_count IS NOT NULL AND NEW.initial_count IS NULL THEN
    NEW.initial_count := NEW.initial_bird_count;
  END IF;
  
  IF NEW.current_bird_count IS NOT NULL AND NEW.current_count IS NULL THEN
    NEW.current_count := NEW.current_bird_count;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;