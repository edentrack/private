/*
  # Update Expense Category Constraint

  1. Changes
    - Drop existing check constraint on expenses.category
    - Add new constraint including "Chicks Purchase" and "Chicks Transport"

  2. Notes
    - Allows new expense categories for flock purchase tracking
    - Maintains data integrity with explicit allowed values
*/

DO $$
BEGIN
  ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
  
  ALTER TABLE expenses ADD CONSTRAINT expenses_category_check 
    CHECK (category IN ('Feed', 'Medication', 'Equipment', 'Labor', 'Chicks Purchase', 'Chicks Transport', 'Other'));
END $$;
