/*
  # Fix Sales Invoices View Column Mappings
  
  1. Changes
    - Update sales_invoices view to properly map column names
    - Map `paid_amount` to `amount_paid` for compatibility
    - Map `issue_date` to `invoice_date` for compatibility
    - Map `total_amount` to `total` for compatibility
    
  2. Purpose
    - Fix schema cache errors with amount_paid column
    - Ensure components can access invoice data correctly
*/

-- Drop and recreate the view with correct column mappings
DROP VIEW IF EXISTS sales_invoices;

CREATE VIEW sales_invoices AS
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