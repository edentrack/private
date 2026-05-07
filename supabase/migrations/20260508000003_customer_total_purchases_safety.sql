-- Safety net for environments where the original create-customers
-- migration ran differently and the total_purchases column never landed.
-- Idempotent: no-op when the column already exists.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS total_purchases numeric(12,2) NOT NULL DEFAULT 0;

-- Re-run the aggregator now that we know total_purchases exists.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT id FROM customers LOOP
    PERFORM refresh_customer_aggregates(c.id);
  END LOOP;
END;
$$;
