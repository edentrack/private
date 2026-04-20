/*
  # Fix Expense Category Enum - Add Chicks Categories

  1. Changes
    - Add "chicks purchase" and "chicks transport" to the expense_category enum type
    - These values must match the lowercase format used in the database
  
  2. Notes
    - The enum type is case-sensitive and stores lowercase values
    - This allows the backfill script to create chicks purchase and transport expenses
    - Values are stored as lowercase but displayed as "Chicks Purchase" and "Chicks Transport" in UI
*/

-- Add the new enum values to expense_category type
DO $$
BEGIN
  -- Add 'chicks purchase' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'chicks purchase' 
    AND enumtypid = 'expense_category'::regtype
  ) THEN
    ALTER TYPE expense_category ADD VALUE 'chicks purchase';
  END IF;

  -- Add 'chicks transport' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'chicks transport' 
    AND enumtypid = 'expense_category'::regtype
  ) THEN
    ALTER TYPE expense_category ADD VALUE 'chicks transport';
  END IF;
END $$;
