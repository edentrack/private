-- Allow all authenticated users to browse approved/verified suppliers
CREATE POLICY "Anyone can view approved suppliers"
  ON marketplace_suppliers
  FOR SELECT
  TO authenticated
  USING (status IN ('approved', 'verified'));

-- Add products array and delivery_available flag
ALTER TABLE marketplace_suppliers
  ADD COLUMN IF NOT EXISTS products text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS delivery_available boolean DEFAULT false NOT NULL;
