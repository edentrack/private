/*
  # Add Total Sample Weight to Weight Logs

  1. New Column
    - `total_sample_weight` (numeric, nullable) - Total weight of all birds in the sample
    - Allows users to enter total weight and have average calculated automatically

  2. Purpose
    - Support both input methods: entering average weight directly OR entering total sample weight
    - Calculate average weight from total / sample_size when total is provided
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weight_logs' AND column_name = 'total_sample_weight'
  ) THEN
    ALTER TABLE weight_logs ADD COLUMN total_sample_weight numeric;
  END IF;
END $$;
