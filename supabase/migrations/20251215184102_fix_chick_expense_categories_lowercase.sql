/*
  # Fix Chick Expense Categories to Lowercase

  1. Changes
    - Update existing expenses with kind='chicks_purchase' to have category='chicks purchase'
    - Update existing expenses with kind='chicks_transport' to have category='chicks transport'
    
  2. Reason
    - The expense_category enum uses lowercase values
    - Previous code used capitalized category names which don't match the enum
    - Using kind field to identify records since it's reliable
*/

-- Update purchase expenses to use lowercase category
UPDATE expenses
SET category = 'chicks purchase'
WHERE kind = 'chicks_purchase'
  AND category::text != 'chicks purchase';

-- Update transport expenses to use lowercase category
UPDATE expenses
SET category = 'chicks transport'
WHERE kind = 'chicks_transport'
  AND category::text != 'chicks transport';
