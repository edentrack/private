/*
  # Create Sales Receipts and Revenues Tables

  1. New Tables
    - `sales_receipts` - Quick sales receipts for daily transactions
    - `sales_receipt_items` - Line items for each receipt
    - `sales_invoices` - Formal invoices (maps to existing invoices table)
    - `revenues` - Track all revenue sources

  2. Security
    - Enable RLS on all tables
    - Add policies using get_user_farm_ids() helper function
*/

-- Create sales_receipts table
CREATE TABLE IF NOT EXISTS sales_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  customer_id uuid REFERENCES customers(id),
  customer_name text,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text DEFAULT 'cash',
  payment_status text DEFAULT 'paid',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create sales_receipt_items table
CREATE TABLE IF NOT EXISTS sales_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES sales_receipts(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  item_description text NOT NULL,
  quantity numeric NOT NULL,
  unit text DEFAULT 'unit',
  unit_price numeric NOT NULL,
  line_total numeric NOT NULL,
  flock_id uuid REFERENCES flocks(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create sales_invoices view/alias for invoices table (for compatibility)
-- The invoices table already exists, so we just ensure proper policies

-- Create revenues table
CREATE TABLE IF NOT EXISTS revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id uuid REFERENCES flocks(id),
  source_type text NOT NULL,
  source_id uuid,
  amount numeric NOT NULL,
  currency text DEFAULT 'CFA',
  description text,
  revenue_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE sales_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenues ENABLE ROW LEVEL SECURITY;

-- Create policies for sales_receipts
CREATE POLICY "Users can manage sales receipts"
  ON sales_receipts FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Create policies for sales_receipt_items (access through parent receipt)
CREATE POLICY "Users can view receipt items"
  ON sales_receipt_items FOR SELECT TO authenticated
  USING (
    receipt_id IN (
      SELECT id FROM sales_receipts 
      WHERE farm_id IN (SELECT get_user_farm_ids())
    )
  );

CREATE POLICY "Users can insert receipt items"
  ON sales_receipt_items FOR INSERT TO authenticated
  WITH CHECK (
    receipt_id IN (
      SELECT id FROM sales_receipts 
      WHERE farm_id IN (SELECT get_user_farm_ids())
    )
  );

CREATE POLICY "Users can update receipt items"
  ON sales_receipt_items FOR UPDATE TO authenticated
  USING (
    receipt_id IN (
      SELECT id FROM sales_receipts 
      WHERE farm_id IN (SELECT get_user_farm_ids())
    )
  )
  WITH CHECK (
    receipt_id IN (
      SELECT id FROM sales_receipts 
      WHERE farm_id IN (SELECT get_user_farm_ids())
    )
  );

CREATE POLICY "Users can delete receipt items"
  ON sales_receipt_items FOR DELETE TO authenticated
  USING (
    receipt_id IN (
      SELECT id FROM sales_receipts 
      WHERE farm_id IN (SELECT get_user_farm_ids())
    )
  );

-- Create policies for revenues
CREATE POLICY "Users can manage revenues"
  ON revenues FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_receipts_farm_id ON sales_receipts(farm_id);
CREATE INDEX IF NOT EXISTS idx_sales_receipts_sale_date ON sales_receipts(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_receipt_items_receipt_id ON sales_receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_revenues_farm_id ON revenues(farm_id);
CREATE INDEX IF NOT EXISTS idx_revenues_source_type ON revenues(source_type);