/*
  # Create Customers and Sales Management System

  1. New Tables
    - `customers`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `name` (text, required)
      - `email` (text)
      - `phone` (text)
      - `address` (text)
      - `notes` (text)
      - `total_purchases` (numeric, tracked amount)
      - `outstanding_balance` (numeric)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `sales_invoices`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `customer_id` (uuid, references customers)
      - `invoice_number` (text, unique per farm)
      - `invoice_date` (date)
      - `due_date` (date)
      - `status` (draft, sent, paid, overdue, cancelled)
      - `subtotal` (numeric)
      - `tax` (numeric)
      - `total` (numeric)
      - `amount_paid` (numeric)
      - `payment_method` (text)
      - `payment_date` (date)
      - `notes` (text)
      - `created_by` (uuid, references profiles)
      - `created_at` (timestamptz)

    - `invoice_items`
      - `id` (uuid, primary key)
      - `invoice_id` (uuid, references sales_invoices)
      - `description` (text)
      - `item_type` (eggs, birds, other)
      - `quantity` (numeric)
      - `unit_price` (numeric)
      - `total` (numeric)
      - `reference_id` (uuid, optional - links to egg_sales or flock)

  2. Security
    - Enable RLS on all tables
    - Farm members can view customers and invoices
    - Managers/owners can create/edit
*/

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  address text,
  notes text,
  total_purchases numeric(12,2) DEFAULT 0 NOT NULL,
  outstanding_balance numeric(12,2) DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create sales invoices table
CREATE TABLE IF NOT EXISTS sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  invoice_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date,
  status text DEFAULT 'draft' NOT NULL CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  subtotal numeric(12,2) DEFAULT 0 NOT NULL,
  tax numeric(12,2) DEFAULT 0 NOT NULL,
  total numeric(12,2) DEFAULT 0 NOT NULL,
  amount_paid numeric(12,2) DEFAULT 0 NOT NULL,
  payment_method text,
  payment_date date,
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(farm_id, invoice_number)
);

-- Create invoice items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES sales_invoices(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  item_type text DEFAULT 'other' CHECK (item_type IN ('eggs', 'birds', 'other')),
  quantity numeric(12,2) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  total numeric(12,2) NOT NULL,
  reference_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- Policies for customers
CREATE POLICY "Farm members can view customers"
  ON customers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = customers.farm_id
    )
  );

CREATE POLICY "Farm managers can create customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = customers.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Farm managers can update customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = customers.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = customers.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Farm managers can delete customers"
  ON customers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = customers.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

-- Policies for sales_invoices
CREATE POLICY "Farm members can view invoices"
  ON sales_invoices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = sales_invoices.farm_id
    )
  );

CREATE POLICY "Farm managers can create invoices"
  ON sales_invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = sales_invoices.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Farm managers can update invoices"
  ON sales_invoices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = sales_invoices.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = sales_invoices.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Farm managers can delete invoices"
  ON sales_invoices FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = sales_invoices.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

-- Policies for invoice_items
CREATE POLICY "Farm members can view invoice items"
  ON invoice_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales_invoices
      JOIN profiles ON profiles.farm_id = sales_invoices.farm_id
      WHERE sales_invoices.id = invoice_items.invoice_id
      AND profiles.id = auth.uid()
    )
  );

CREATE POLICY "Farm managers can manage invoice items"
  ON invoice_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales_invoices
      JOIN profiles ON profiles.farm_id = sales_invoices.farm_id
      WHERE sales_invoices.id = invoice_items.invoice_id
      AND profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales_invoices
      JOIN profiles ON profiles.farm_id = sales_invoices.farm_id
      WHERE sales_invoices.id = invoice_items.invoice_id
      AND profiles.id = auth.uid()
      AND profiles.role IN ('owner', 'manager')
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customers_farm_id ON customers(farm_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_farm_id ON sales_invoices(farm_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer_id ON sales_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_status ON sales_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_customers_updated_at'
  ) THEN
    CREATE TRIGGER update_customers_updated_at
      BEFORE UPDATE ON customers
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_sales_invoices_updated_at'
  ) THEN
    CREATE TRIGGER update_sales_invoices_updated_at
      BEFORE UPDATE ON sales_invoices
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
