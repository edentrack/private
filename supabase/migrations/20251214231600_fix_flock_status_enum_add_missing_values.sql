/*
  # Fix Flock Status Enum - Add Missing Values

  1. Problem
    - The flock_status enum is missing 'sold' and 'deceased' values
    - This causes archive functionality to fail with "invalid input value for enum"
    
  2. Solution
    - Add 'sold' and 'deceased' to the flock_status enum type
    - Ensure all four values exist: 'active', 'sold', 'deceased', 'archived'
    
  3. Safety
    - Uses ALTER TYPE ADD VALUE which is safe and non-destructive
    - Checks if values already exist before adding
*/

-- Add 'sold' value to flock_status enum if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'sold' 
    AND enumtypid = 'flock_status'::regtype
  ) THEN
    ALTER TYPE flock_status ADD VALUE 'sold';
  END IF;
END $$;

-- Add 'deceased' value to flock_status enum if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'deceased' 
    AND enumtypid = 'flock_status'::regtype
  ) THEN
    ALTER TYPE flock_status ADD VALUE 'deceased';
  END IF;
END $$;
