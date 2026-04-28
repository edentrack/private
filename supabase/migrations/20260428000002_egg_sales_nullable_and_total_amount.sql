-- =============================================================================
-- Fix egg_sales so Eden AI can insert records without flock_id/user_id.
-- Make legacy NOT NULL columns nullable (LogSaleModal already omits them).
-- Add total_amount and trays columns if not present.
-- =============================================================================

DO $$
BEGIN
  -- flock_id was originally NOT NULL but egg sales don't always belong to a flock
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'egg_sales' AND column_name = 'flock_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE egg_sales ALTER COLUMN flock_id DROP NOT NULL;
  END IF;

  -- user_id is legacy; sold_by replaced it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'egg_sales' AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE egg_sales ALTER COLUMN user_id DROP NOT NULL;
  END IF;

  -- date was the original date column; sale_date and sold_on replaced it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'egg_sales' AND column_name = 'date'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE egg_sales ALTER COLUMN date DROP NOT NULL,
                          ALTER COLUMN date SET DEFAULT CURRENT_DATE;
  END IF;

  -- trays_sold was the original quantity column; trays replaced it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'egg_sales' AND column_name = 'trays_sold'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE egg_sales ALTER COLUMN trays_sold DROP NOT NULL,
                          ALTER COLUMN trays_sold SET DEFAULT 0;
  END IF;

  -- trays column (used by all newer code paths)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'egg_sales' AND column_name = 'trays'
  ) THEN
    ALTER TABLE egg_sales ADD COLUMN trays numeric DEFAULT 0 NOT NULL;
  END IF;

  -- total_amount is used by EggSalesList to display revenue
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'egg_sales' AND column_name = 'total_amount'
  ) THEN
    ALTER TABLE egg_sales ADD COLUMN total_amount numeric DEFAULT 0 NOT NULL;
  END IF;

  -- sold_on alias for the sale date (older column)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'egg_sales' AND column_name = 'sold_on'
  ) THEN
    ALTER TABLE egg_sales ADD COLUMN sold_on date DEFAULT CURRENT_DATE;
  END IF;
END $$;
