-- Create Marketplace Suppliers Table (Safe Version - Handles Existing Objects)

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Suppliers can view own records" ON marketplace_suppliers;
DROP POLICY IF EXISTS "Suppliers can create own records" ON marketplace_suppliers;
DROP POLICY IF EXISTS "Suppliers can update own records" ON marketplace_suppliers;
DROP POLICY IF EXISTS "Super admins can manage all suppliers" ON marketplace_suppliers;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS prevent_supplier_status_change_trigger ON marketplace_suppliers;
DROP TRIGGER IF EXISTS on_marketplace_suppliers_updated ON marketplace_suppliers;

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS prevent_supplier_status_change();
DROP FUNCTION IF EXISTS update_marketplace_suppliers_timestamp();

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS marketplace_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  business_name TEXT,
  category TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'verified')) NOT NULL,
  is_featured BOOLEAN DEFAULT false NOT NULL,
  verification_documents TEXT[],
  website_url TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE marketplace_suppliers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Suppliers can view own records"
  ON marketplace_suppliers
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE POLICY "Suppliers can create own records"
  ON marketplace_suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Suppliers can update own records"
  ON marketplace_suppliers
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION prevent_supplier_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status != NEW.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    ) THEN
      RAISE EXCEPTION 'Only super admins can change supplier status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_supplier_status_change_trigger
  BEFORE UPDATE ON marketplace_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION prevent_supplier_status_change();

CREATE POLICY "Super admins can manage all suppliers"
  ON marketplace_suppliers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

CREATE OR REPLACE FUNCTION update_marketplace_suppliers_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_marketplace_suppliers_updated
  BEFORE UPDATE ON marketplace_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_marketplace_suppliers_timestamp();

-- Create indexes (IF NOT EXISTS is safe)
CREATE INDEX IF NOT EXISTS idx_marketplace_suppliers_status ON marketplace_suppliers(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_suppliers_user_id ON marketplace_suppliers(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_suppliers_featured ON marketplace_suppliers(is_featured) WHERE is_featured = true;












