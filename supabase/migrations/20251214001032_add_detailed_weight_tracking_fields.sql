/*
  # Add Detailed Weight Tracking Fields
  
  1. Changes to `weight_logs` table
    - Add `individual_weights` (jsonb) - Array of individual bird weights
    - Add `min_weight` (numeric) - Minimum weight in sample
    - Add `max_weight` (numeric) - Maximum weight in sample
    - Add `std_dev` (numeric) - Standard deviation
    - Add `coefficient_variation` (numeric) - CV percentage for uniformity
    - Add `total_estimated_weight` (numeric) - Estimated total flock weight
    - Add `daily_gain` (numeric) - Daily weight gain in grams
    - Add `market_ready` (boolean) - Market readiness flag for broilers
    - Rename `weight_kg` to `average_weight` for clarity
    
  2. Purpose
    - Support individual weight entry instead of manual averaging
    - Provide comprehensive statistical analysis
    - Enable growth tracking and market readiness assessment
    - Support farmer-friendly workflow
*/

-- Add new columns to weight_logs table
DO $$
BEGIN
  -- Rename weight_kg to average_weight
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weight_logs' AND column_name = 'weight_kg'
  ) THEN
    ALTER TABLE weight_logs RENAME COLUMN weight_kg TO average_weight;
  END IF;
  
  -- Add individual_weights column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weight_logs' AND column_name = 'individual_weights'
  ) THEN
    ALTER TABLE weight_logs ADD COLUMN individual_weights jsonb;
  END IF;
  
  -- Add min_weight column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weight_logs' AND column_name = 'min_weight'
  ) THEN
    ALTER TABLE weight_logs ADD COLUMN min_weight numeric(6,3);
  END IF;
  
  -- Add max_weight column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weight_logs' AND column_name = 'max_weight'
  ) THEN
    ALTER TABLE weight_logs ADD COLUMN max_weight numeric(6,3);
  END IF;
  
  -- Add std_dev column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weight_logs' AND column_name = 'std_dev'
  ) THEN
    ALTER TABLE weight_logs ADD COLUMN std_dev numeric(6,3);
  END IF;
  
  -- Add coefficient_variation column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weight_logs' AND column_name = 'coefficient_variation'
  ) THEN
    ALTER TABLE weight_logs ADD COLUMN coefficient_variation numeric(6,2);
  END IF;
  
  -- Add total_estimated_weight column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weight_logs' AND column_name = 'total_estimated_weight'
  ) THEN
    ALTER TABLE weight_logs ADD COLUMN total_estimated_weight numeric(10,2);
  END IF;
  
  -- Add daily_gain column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weight_logs' AND column_name = 'daily_gain'
  ) THEN
    ALTER TABLE weight_logs ADD COLUMN daily_gain numeric(6,2);
  END IF;
  
  -- Add market_ready column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weight_logs' AND column_name = 'market_ready'
  ) THEN
    ALTER TABLE weight_logs ADD COLUMN market_ready boolean DEFAULT false;
  END IF;
END $$;
