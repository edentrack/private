/*
  # Enhanced Feed Stock Fields

  1. Changes to feed_stock table
    - Add `initial_stock_bags` (numeric) - tracks the initial quantity when feed type was created
    - Add `current_stock_bags` (numeric) - replaces bags_in_stock as the main stock field
    - Add `unit` (text, default 'bags') - allows different units (bags, kg, tonnes, etc.)
    - Add `notes` (text, nullable) - optional additional information about the feed type
    
  2. Data Migration
    - Copy existing bags_in_stock values to both initial_stock_bags and current_stock_bags
    - Set default unit to 'bags' for existing records
    
  3. Notes
    - bags_in_stock column is kept for backward compatibility but current_stock_bags is the new primary field
    - All new inserts should use current_stock_bags and initial_stock_bags
*/

-- Add new columns to feed_stock table
ALTER TABLE feed_stock 
  ADD COLUMN IF NOT EXISTS initial_stock_bags numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_stock_bags numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit text DEFAULT 'bags',
  ADD COLUMN IF NOT EXISTS notes text;

-- Migrate existing data: copy bags_in_stock to both initial_stock_bags and current_stock_bags
UPDATE feed_stock 
SET 
  initial_stock_bags = COALESCE(bags_in_stock, 0),
  current_stock_bags = COALESCE(bags_in_stock, 0),
  unit = COALESCE(unit, 'bags')
WHERE initial_stock_bags IS NULL OR current_stock_bags IS NULL;
