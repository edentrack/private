/*
  # Create Sales Receipts System
  
  ## Overview
  Implements a comprehensive receipt-based sales system for eggs, broilers, and chickens with automatic
  inventory management and revenue reporting.
  
  ## New Tables
  
  ### 1. `sales_receipts`
  Main receipt table for all sales transactions. Receipts are permanent and cannot be edited.
  - `id` (uuid, primary key)
  - `farm_id` (uuid) - Multi-tenant farm reference
  - `receipt_number` (text) - Auto-generated unique receipt number
  - `flock_id` (uuid, nullable) - Optional flock reference for tracking
  - `customer_name` (text, nullable) - Customer name (optional, for walk-ins)
  - `sale_date` (date) - Date of sale
  - `subtotal` (numeric) - Total before any adjustments
  - `total` (numeric) - Final total amount
  - `payment_method` (text) - Cash, Card, Transfer, etc.
  - `notes` (text, nullable) - Additional notes
  - `created_by` (uuid) - User who created the receipt
  - `created_at` (timestamp) - Creation timestamp
  - Status: Receipts are immutable after creation
  
  ### 2. `receipt_items`
  Line items for each receipt with product details
  - `id` (uuid, primary key)
  - `receipt_id` (uuid) - Foreign key to sales_receipts
  - `product_type` (enum) - 'eggs', 'broilers', 'chickens'
  - `description` (text) - Product description
  - `quantity` (numeric) - Quantity sold
  - `unit` (text) - Unit of measurement (trays, birds, kg)
  - `unit_price` (numeric) - Price per unit
  - `total` (numeric) - Line item total
  - `inventory_deducted` (boolean) - Whether inventory was deducted
  - `created_at` (timestamp)
  
  ### 3. `receipt_refunds`
  Refund audit trail with revenue reversal tracking
  - `id` (uuid, primary key)
  - `receipt_id` (uuid) - Original receipt being refunded
  - `farm_id` (uuid) - Multi-tenant farm reference
  - `refund_amount` (numeric) - Amount being refunded
  - `refund_reason` (text) - Reason for refund
  - `items_refunded` (jsonb) - Details of refunded items
  - `inventory_restored` (boolean) - Whether inventory was restored
  - `revenue_reversed` (boolean) - Whether revenue was reversed
  - `refunded_by` (uuid) - User who processed refund
  - `refunded_at` (timestamp) - Refund timestamp
  
  ## Product Types
  - **eggs**: Egg trays for layer flocks, auto-deducts from egg inventory
  - **broilers**: Live broiler chickens, tracked by flock
  - **chickens**: General chicken sales (layers, culled birds, etc.)
  
  ## Automatic Integrations
  
  ### Inventory Integration
  When a receipt is created with eggs:
  - Automatically creates inventory_movements record (direction: 'out')
  - Deducts from egg_collections available stock
  - Tracks audit trail
  
  ### Revenue Integration
  When a receipt is created:
  - Automatically creates revenue record
  - Links to flock if specified
  - Updates farm financial analytics
  
  ### Refund Integration
  When a refund is processed:
  - Creates refund audit record
  - Creates negative revenue entry to reverse original sale
  - Optionally restores inventory if applicable
  - Maintains complete audit trail
  
  ## Security
  - Enable RLS on all tables
  - Receipts are read-only after creation (no updates allowed)
  - Only refunds can "delete" (via audit trail, original stays)
  - All tables scoped to farm_id for multi-tenancy
  - Only authorized users can create receipts and process refunds
*/

-- Create product type enum
DO $$ BEGIN
  CREATE TYPE product_type_enum AS ENUM ('eggs', 'broilers', 'chickens');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create sales_receipts table
CREATE TABLE IF NOT EXISTS sales_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  flock_id uuid REFERENCES flocks(id) ON DELETE SET NULL,
  customer_name text,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  subtotal numeric NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  total numeric NOT NULL DEFAULT 0 CHECK (total >= 0),
  payment_method text NOT NULL DEFAULT 'Cash',
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_receipt_number_per_farm UNIQUE (farm_id, receipt_number)
);

-- Create receipt_items table
CREATE TABLE IF NOT EXISTS receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES sales_receipts(id) ON DELETE CASCADE,
  product_type product_type_enum NOT NULL,
  description text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'units',
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  total numeric NOT NULL CHECK (total >= 0),
  inventory_deducted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create receipt_refunds table
CREATE TABLE IF NOT EXISTS receipt_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES sales_receipts(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  refund_amount numeric NOT NULL CHECK (refund_amount > 0),
  refund_reason text NOT NULL,
  items_refunded jsonb NOT NULL DEFAULT '[]'::jsonb,
  inventory_restored boolean NOT NULL DEFAULT false,
  revenue_reversed boolean NOT NULL DEFAULT false,
  refunded_by uuid NOT NULL REFERENCES auth.users(id),
  refunded_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE sales_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_refunds ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sales_receipts
CREATE POLICY "Users can view receipts from their farm"
  ON sales_receipts FOR SELECT
  TO authenticated
  USING (
    farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can create receipts for their farm"
  ON sales_receipts FOR INSERT
  TO authenticated
  WITH CHECK (
    farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

-- RLS Policies for receipt_items
CREATE POLICY "Users can view receipt items from their farm"
  ON receipt_items FOR SELECT
  TO authenticated
  USING (
    receipt_id IN (
      SELECT id FROM sales_receipts 
      WHERE farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Users can create receipt items for their farm"
  ON receipt_items FOR INSERT
  TO authenticated
  WITH CHECK (
    receipt_id IN (
      SELECT id FROM sales_receipts 
      WHERE farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid())
    )
  );

-- RLS Policies for receipt_refunds
CREATE POLICY "Users can view refunds from their farm"
  ON receipt_refunds FOR SELECT
  TO authenticated
  USING (
    farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can create refunds for their farm"
  ON receipt_refunds FOR INSERT
  TO authenticated
  WITH CHECK (
    farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid())
    AND refunded_by = auth.uid()
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_receipts_farm_id ON sales_receipts(farm_id);
CREATE INDEX IF NOT EXISTS idx_sales_receipts_flock_id ON sales_receipts(flock_id);
CREATE INDEX IF NOT EXISTS idx_sales_receipts_sale_date ON sales_receipts(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_receipts_created_by ON sales_receipts(created_by);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_product_type ON receipt_items(product_type);
CREATE INDEX IF NOT EXISTS idx_receipt_refunds_receipt_id ON receipt_refunds(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_refunds_farm_id ON receipt_refunds(farm_id);
