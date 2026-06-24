/*
  Security fix — convert 3 SECURITY DEFINER views to SECURITY INVOKER.

  The database linter (get_advisors security) flagged three views as
  ERROR-level security_definer_view:
    - public.feed_stock          (from feed_inventory + feed_types)
    - public.other_inventory     (from other_inventory_items)
    - public.sales_invoices      (from invoices)

  A SECURITY DEFINER view runs with the privileges of the view OWNER
  (postgres), which BYPASSES the row-level security of the querying
  user. Because all three select farm-scoped data (every row has a
  farm_id), a signed-in user could query these views and read OTHER
  farms' feed stock, inventory, and invoices — a cross-tenant data
  leak.

  Fix: recreate each view WITH (security_invoker = true) so it runs
  with the QUERYING user's privileges, which means the RLS policies on
  feed_inventory / other_inventory_items / invoices (all confirmed
  enabled) are enforced. Definitions are preserved byte-for-byte from
  the current pg_views output — only the security mode changes.

  This is the same class of fix applied to farm_active_headcount in
  20260515000001.
*/

-- ── feed_stock ──────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.feed_stock;
CREATE VIEW public.feed_stock
  WITH (security_invoker = true) AS
  SELECT fi.id,
         fi.farm_id,
         ft.name AS feed_type,
         fi.quantity AS current_stock_bags,
         fi.quantity AS bags_in_stock,
         ft.unit,
         ft.kg_per_unit,
         ft.description,
         fi.updated_at AS last_updated
    FROM feed_inventory fi
    JOIN feed_types ft ON fi.feed_type_id = ft.id;

-- ── other_inventory ─────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.other_inventory;
CREATE VIEW public.other_inventory
  WITH (security_invoker = true) AS
  SELECT id,
         farm_id,
         name AS item_name,
         category,
         unit,
         quantity,
         notes,
         created_at,
         updated_at
    FROM other_inventory_items;

-- ── sales_invoices ──────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.sales_invoices;
CREATE VIEW public.sales_invoices
  WITH (security_invoker = true) AS
  SELECT id,
         farm_id,
         customer_id,
         invoice_number,
         status,
         issue_date AS invoice_date,
         due_date,
         total_amount AS total,
         paid_amount AS amount_paid,
         notes,
         created_at,
         updated_at
    FROM invoices;
