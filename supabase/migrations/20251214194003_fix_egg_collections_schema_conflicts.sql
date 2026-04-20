/*
  # Fix Egg Collections Schema Conflicts

  1. Changes
    - Make `collected_on` column nullable and add default value
    - Keep `collection_date` as the primary date field
    - This resolves the issue where both columns are required but only one is being provided

  2. Security
    - No changes to RLS policies
*/

DO $$
BEGIN
  -- Make collected_on nullable and add default to match collection_date
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'egg_collections' AND column_name = 'collected_on'
  ) THEN
    ALTER TABLE egg_collections 
    ALTER COLUMN collected_on DROP NOT NULL,
    ALTER COLUMN collected_on SET DEFAULT CURRENT_DATE;
  END IF;
END $$;
