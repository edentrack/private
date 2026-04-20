/*
  # Add customer_id to bird_sales table
  
  1. Changes
    - Add customer_id column to bird_sales table
    - Add foreign key constraint to customers table
    - Add index for faster lookups
  
  2. Security
    - No RLS changes needed (inherits from bird_sales table policies)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bird_sales' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE bird_sales ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_bird_sales_customer ON bird_sales(customer_id);
  END IF;
END $$;
