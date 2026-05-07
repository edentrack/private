-- BUG-019: Customer KPI aggregates (order_count, last_purchase_at) were
-- not being maintained anywhere, so the Customers list and per-customer
-- detail page rendered stale "0 orders / never purchased" no matter how
-- many sales the user logged.
--
-- Add the two missing columns and a trigger that recomputes them from
-- bird_sales + egg_sales every time a sale row changes. Trigger-based
-- aggregation is the right architectural choice here because:
--   1. It works for ANY write path (modal, Eden bulk-action, future API).
--   2. It survives partial deletes / payment-status flips.
--   3. The frontend just reads the columns — no recompute on every render.
--
-- total_purchases was already on the table but never updated by the app,
-- so the same trigger refreshes it too.

-- 1) Schema additions ----------------------------------------------------
-- Defensive: add total_purchases if the original migration was never run
-- against this environment (some preview branches were created without
-- the create-customers migration). The column is no-op when it already
-- exists.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS total_purchases numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_purchase_at timestamptz;

-- 2) Aggregator -----------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_customer_aggregates(target_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF target_customer_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE customers c
  SET
    total_purchases = COALESCE((
      SELECT SUM(total_amount) FROM bird_sales WHERE customer_id = target_customer_id
    ), 0) + COALESCE((
      SELECT SUM(total_amount) FROM egg_sales WHERE customer_id = target_customer_id
    ), 0),
    order_count = COALESCE((
      SELECT COUNT(*) FROM bird_sales WHERE customer_id = target_customer_id
    ), 0) + COALESCE((
      SELECT COUNT(*) FROM egg_sales WHERE customer_id = target_customer_id
    ), 0),
    last_purchase_at = (
      SELECT MAX(d) FROM (
        SELECT MAX(sale_date::timestamptz) AS d FROM bird_sales WHERE customer_id = target_customer_id
        UNION ALL
        SELECT MAX(sale_date::timestamptz) AS d FROM egg_sales WHERE customer_id = target_customer_id
      ) all_sales
    ),
    updated_at = now()
  WHERE c.id = target_customer_id;
END;
$$;

-- 3) Trigger handler ------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_refresh_customer_on_sale()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Refresh BOTH the old and new customer (handles customer reassignment).
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM refresh_customer_aggregates(NEW.customer_id);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM refresh_customer_aggregates(OLD.customer_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4) Wire to bird_sales + egg_sales --------------------------------------
DROP TRIGGER IF EXISTS bird_sales_refresh_customer ON bird_sales;
CREATE TRIGGER bird_sales_refresh_customer
  AFTER INSERT OR UPDATE OF customer_id, total_amount, sale_date OR DELETE
  ON bird_sales
  FOR EACH ROW
  EXECUTE FUNCTION trg_refresh_customer_on_sale();

DROP TRIGGER IF EXISTS egg_sales_refresh_customer ON egg_sales;
CREATE TRIGGER egg_sales_refresh_customer
  AFTER INSERT OR UPDATE OF customer_id, total_amount, sale_date OR DELETE
  ON egg_sales
  FOR EACH ROW
  EXECUTE FUNCTION trg_refresh_customer_on_sale();

-- 5) Backfill existing data ----------------------------------------------
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT id FROM customers LOOP
    PERFORM refresh_customer_aggregates(c.id);
  END LOOP;
END;
$$;
