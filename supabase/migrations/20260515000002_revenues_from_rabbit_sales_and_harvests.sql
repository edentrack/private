/*
  Fix sales/expenses revenue mismatch — May 2026.

  Bug: the Expenses page reads from the centralized `revenues` table to
  show "Revenue Generated". `bird_sales` has a trigger that feeds
  revenues automatically (`create_revenue_from_bird_sale`), but
  `rabbit_sales` and `harvest_records` don't — they were added later and
  the analogous triggers were never written. So farms doing rabbit or
  fish sales saw the Sales page total as N but the Expenses page
  Revenue Generated as 0. Caught via Supabase MCP audit on 2026-05-15
  on test2's Audit Bunny Hutch farm (5 rabbit_sales totaling
  231,000 XAF, revenues table empty).

  This migration:

    1. Adds `create_revenue_from_rabbit_sale()` + trigger on rabbit_sales
    2. Adds `create_revenue_from_harvest()` + trigger on harvest_records
    3. Backfills `revenues` rows for every existing rabbit_sale and
       harvest_record that doesn't already have a matching row

  Design improvements vs bird_sale's existing trigger:

    - Use `source_id = NEW.id` for matching on UPDATE/DELETE instead of
      composite (farm_id, flock_id, sale_date). The composite key can
      collide if the same farm has multiple sales of the same type on
      the same day; source_id is the canonical FK.

    - Pin search_path inside the function definitions (same hardening
      we just applied to the rabbit_growout triggers — May 2026 ADV
      audit).

  Both new functions follow the bird_sale convention of SECURITY
  DEFINER so the trigger can write to revenues even when the calling
  user's RLS would only permit a SELECT. That's the same trust model
  the existing bird_sale trigger uses, so I'm matching it for
  consistency (not opening a new hole).
*/

-- ── 1. rabbit_sales → revenues ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_revenue_from_rabbit_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.revenues (
      farm_id,
      flock_id,
      amount,
      currency,
      source_type,
      source_id,
      revenue_date,
      description
    ) VALUES (
      NEW.farm_id,
      NEW.flock_id,
      COALESCE(NEW.total_amount, 0),
      NULL,                                 -- rabbit_sales has no currency column; falls back to farm.currency_code at read time
      'rabbit_sale',
      NEW.id,
      NEW.sold_at,
      'Rabbit sale: ' || NEW.count || ' ' || CASE WHEN NEW.count = 1 THEN 'rabbit' ELSE 'rabbits' END
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.revenues
       SET amount       = COALESCE(NEW.total_amount, 0),
           revenue_date = NEW.sold_at,
           description  = 'Rabbit sale: ' || NEW.count || ' ' || CASE WHEN NEW.count = 1 THEN 'rabbit' ELSE 'rabbits' END,
           updated_at   = now()
     WHERE source_id = NEW.id
       AND source_type = 'rabbit_sale';
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.revenues
     WHERE source_id = OLD.id
       AND source_type = 'rabbit_sale';
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_revenue_from_rabbit_sale ON public.rabbit_sales;
CREATE TRIGGER trg_create_revenue_from_rabbit_sale
  AFTER INSERT OR UPDATE OR DELETE ON public.rabbit_sales
  FOR EACH ROW EXECUTE FUNCTION public.create_revenue_from_rabbit_sale();

-- ── 2. harvest_records → revenues (fish farms) ─────────────────────────

CREATE OR REPLACE FUNCTION public.create_revenue_from_harvest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.revenues (
      farm_id,
      flock_id,
      amount,
      currency,
      source_type,
      source_id,
      revenue_date,
      description
    ) VALUES (
      NEW.farm_id,
      NEW.flock_id,
      COALESCE(NEW.total_amount, 0),
      NULL,
      'harvest',
      NEW.id,
      NEW.harvested_at,
      'Fish harvest: ' || COALESCE(NEW.total_weight_kg, 0) || ' kg'
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.revenues
       SET amount       = COALESCE(NEW.total_amount, 0),
           revenue_date = NEW.harvested_at,
           description  = 'Fish harvest: ' || COALESCE(NEW.total_weight_kg, 0) || ' kg',
           updated_at   = now()
     WHERE source_id = NEW.id
       AND source_type = 'harvest';
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.revenues
     WHERE source_id = OLD.id
       AND source_type = 'harvest';
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_revenue_from_harvest ON public.harvest_records;
CREATE TRIGGER trg_create_revenue_from_harvest
  AFTER INSERT OR UPDATE OR DELETE ON public.harvest_records
  FOR EACH ROW EXECUTE FUNCTION public.create_revenue_from_harvest();

-- ── 3. Backfill existing rabbit_sales and harvest_records ──────────────
--
-- Idempotent: only inserts a revenues row when one doesn't already
-- exist for that source. Safe to re-run.

INSERT INTO public.revenues (
  farm_id, flock_id, amount, source_type, source_id, revenue_date, description
)
SELECT
  rs.farm_id,
  rs.flock_id,
  COALESCE(rs.total_amount, 0),
  'rabbit_sale',
  rs.id,
  rs.sold_at,
  'Rabbit sale: ' || rs.count || ' ' || CASE WHEN rs.count = 1 THEN 'rabbit' ELSE 'rabbits' END
FROM public.rabbit_sales rs
LEFT JOIN public.revenues r
  ON r.source_id = rs.id AND r.source_type = 'rabbit_sale'
WHERE r.id IS NULL;

INSERT INTO public.revenues (
  farm_id, flock_id, amount, source_type, source_id, revenue_date, description
)
SELECT
  hr.farm_id,
  hr.flock_id,
  COALESCE(hr.total_amount, 0),
  'harvest',
  hr.id,
  hr.harvested_at,
  'Fish harvest: ' || COALESCE(hr.total_weight_kg, 0) || ' kg'
FROM public.harvest_records hr
LEFT JOIN public.revenues r
  ON r.source_id = hr.id AND r.source_type = 'harvest'
WHERE r.id IS NULL;
