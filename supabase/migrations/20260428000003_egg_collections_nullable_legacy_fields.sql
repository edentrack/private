-- =============================================================================
-- Fix egg_collections so Eden AI can insert without user_id (legacy NOT NULL).
-- Also add collected_on alias and make legacy columns flexible.
-- =============================================================================

DO $$
BEGIN
  -- user_id was originally NOT NULL; created_by/collected_by replaced it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'egg_collections' AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE egg_collections ALTER COLUMN user_id DROP NOT NULL;
  END IF;

  -- trays_collected was original quantity column; trays replaced it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'egg_collections' AND column_name = 'trays_collected'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE egg_collections ALTER COLUMN trays_collected DROP NOT NULL,
                                ALTER COLUMN trays_collected SET DEFAULT 0;
  END IF;

  -- collected_on alias (modern code uses this)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'egg_collections' AND column_name = 'collected_on'
  ) THEN
    ALTER TABLE egg_collections ADD COLUMN collected_on date DEFAULT CURRENT_DATE;
  END IF;

  -- broken alias for damaged_eggs (some code paths use broken)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'egg_collections' AND column_name = 'broken'
  ) THEN
    ALTER TABLE egg_collections ADD COLUMN broken int DEFAULT 0;
  END IF;
END $$;
