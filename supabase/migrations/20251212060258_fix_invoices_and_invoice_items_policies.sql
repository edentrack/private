/*
  # Fix Invoices and Invoice Items Policies

  1. Changes
    - Add/fix invoices policies using helper function
    - Enable RLS on invoice_items
    - Add invoice_items policies

  2. Security
    - Users can only access invoices from farms they belong to
    - Invoice items inherit access from their parent invoice
*/

-- Fix invoices policies
DROP POLICY IF EXISTS "Tenant access by farm_id" ON invoices;
DROP POLICY IF EXISTS "Users can manage invoices" ON invoices;

CREATE POLICY "Users can manage invoices"
  ON invoices FOR ALL TO authenticated
  USING (farm_id IN (SELECT get_user_farm_ids()))
  WITH CHECK (farm_id IN (SELECT get_user_farm_ids()));

-- Enable RLS on invoice_items
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- Create invoice_items policies (access through parent invoice)
CREATE POLICY "Users can view invoice items"
  ON invoice_items FOR SELECT TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices 
      WHERE farm_id IN (SELECT get_user_farm_ids())
    )
  );

CREATE POLICY "Users can insert invoice items"
  ON invoice_items FOR INSERT TO authenticated
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM invoices 
      WHERE farm_id IN (SELECT get_user_farm_ids())
    )
  );

CREATE POLICY "Users can update invoice items"
  ON invoice_items FOR UPDATE TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices 
      WHERE farm_id IN (SELECT get_user_farm_ids())
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM invoices 
      WHERE farm_id IN (SELECT get_user_farm_ids())
    )
  );

CREATE POLICY "Users can delete invoice items"
  ON invoice_items FOR DELETE TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices 
      WHERE farm_id IN (SELECT get_user_farm_ids())
    )
  );