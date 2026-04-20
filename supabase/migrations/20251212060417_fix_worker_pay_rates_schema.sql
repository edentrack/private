/*
  # Fix Worker Pay Rates Schema

  1. Changes
    - Add user_id column (alias for worker_id for code compatibility)
    - Add pay_type column (alias for rate_type)
    - Add hourly_rate, overtime_rate, monthly_salary columns
    - Update existing data to populate new columns

  2. Notes
    - Maintains backward compatibility with existing data
    - Supports both hourly and salary pay types
*/

-- Add user_id as a generated column that mirrors worker_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'worker_pay_rates' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE worker_pay_rates ADD COLUMN user_id uuid GENERATED ALWAYS AS (worker_id) STORED;
  END IF;
END $$;

-- Add pay_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'worker_pay_rates' AND column_name = 'pay_type'
  ) THEN
    ALTER TABLE worker_pay_rates ADD COLUMN pay_type text DEFAULT 'hourly';
  END IF;
END $$;

-- Add hourly_rate column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'worker_pay_rates' AND column_name = 'hourly_rate'
  ) THEN
    ALTER TABLE worker_pay_rates ADD COLUMN hourly_rate numeric DEFAULT 0;
  END IF;
END $$;

-- Add overtime_rate column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'worker_pay_rates' AND column_name = 'overtime_rate'
  ) THEN
    ALTER TABLE worker_pay_rates ADD COLUMN overtime_rate numeric DEFAULT 0;
  END IF;
END $$;

-- Add monthly_salary column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'worker_pay_rates' AND column_name = 'monthly_salary'
  ) THEN
    ALTER TABLE worker_pay_rates ADD COLUMN monthly_salary numeric DEFAULT 0;
  END IF;
END $$;

-- Update pay_type based on rate_type for existing records
UPDATE worker_pay_rates
SET pay_type = CASE 
  WHEN rate_type = 'hourly' THEN 'hourly'
  WHEN rate_type = 'monthly' THEN 'salary'
  ELSE rate_type
END
WHERE pay_type IS NULL OR pay_type = 'hourly';

-- Update hourly_rate from rate_amount for hourly workers
UPDATE worker_pay_rates
SET hourly_rate = rate_amount
WHERE rate_type = 'hourly' AND (hourly_rate = 0 OR hourly_rate IS NULL);

-- Update monthly_salary from rate_amount for salaried workers  
UPDATE worker_pay_rates
SET monthly_salary = rate_amount
WHERE rate_type = 'monthly' AND (monthly_salary = 0 OR monthly_salary IS NULL);