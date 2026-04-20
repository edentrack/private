/*
  # Create Sales Invoices View

  1. Changes
    - Create a view called sales_invoices that maps to the invoices table
    - This provides compatibility with components expecting sales_invoices
*/

-- Create view for compatibility with code expecting sales_invoices
CREATE OR REPLACE VIEW sales_invoices AS
SELECT
  id,
  farm_id,
  customer_id,
  invoice_number,
  status,
  issue_date as invoice_date,
  due_date,
  total_amount as total,
  paid_amount as amount_paid,
  notes,
  created_at,
  updated_at
FROM invoices;