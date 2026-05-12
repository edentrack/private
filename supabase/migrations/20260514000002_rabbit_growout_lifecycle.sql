/*
  Rabbits — Phase 2 of the lifecycle rethink.

  Phase 1 (20260513000002) added the cohort concept: each litter spawns
  a `rabbit_growout_groups` row with `current_count` initialised to
  `kits_born_alive`. Now we wire the rest of the lifecycle so that
  count stays accurate without manual intervention:

    1. SALE  → when a rabbit_sales row links to a growout group via
               source_growout_group_id, subtract its `count` from the
               group's `current_count`. When the count hits zero, mark
               the group `status='sold_out'`.
    2. LOSS  → mortality records can now reference a growout group via
               growout_group_id. The trigger below decrements
               current_count the same way a sale does.

  This is also the foundation for the "reproducer species" template
  we'll generalize to pigs / goats / sheep / grasscutters next. The
  same shape works for any species where:
    - You track named breeding stock (registry)
    - Breeding events spawn dated cohorts (litters → growout groups)
    - Cohorts age out via sale + mortality

  When we add pigs, we'll either reuse these tables (renaming
  `rabbit_growout_groups` → `cohorts` with a `species` column) OR
  duplicate the schema verbatim under `pig_growout_groups`. The PR
  that introduces species #2 makes that call. For now we keep the
  rabbit-prefixed names so the schema reads cleanly.
*/

-- ── 1. Auto-decrement on rabbit_sales insert ───────────────────────────
--
-- Fires AFTER INSERT on rabbit_sales. If the new row has a
-- source_growout_group_id, subtract `count` from the group's
-- current_count (floored at zero so a bad input can't go negative).
-- If current_count hits zero, flip status to 'sold_out' so the UI
-- can grey it out and exclude from defaults.
CREATE OR REPLACE FUNCTION public.rabbit_decrement_growout_on_sale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE new_count int;
BEGIN
  IF NEW.source_growout_group_id IS NOT NULL THEN
    UPDATE public.rabbit_growout_groups
       SET current_count = GREATEST(0, current_count - COALESCE(NEW.count, 0)),
           status = CASE
             WHEN GREATEST(0, current_count - COALESCE(NEW.count, 0)) = 0
               THEN 'sold_out'
             ELSE status
           END
     WHERE id = NEW.source_growout_group_id
     RETURNING current_count INTO new_count;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rabbit_sales_decrement_growout ON public.rabbit_sales;
CREATE TRIGGER trg_rabbit_sales_decrement_growout
  AFTER INSERT ON public.rabbit_sales
  FOR EACH ROW EXECUTE FUNCTION public.rabbit_decrement_growout_on_sale();

-- ── 2. Mortality on growout — schema + trigger ─────────────────────────
--
-- The `mortality_records` table already exists from the poultry era,
-- shared across species. We add a growout_group_id link so a
-- rabbit mortality entry can attribute the loss to a specific cohort
-- (rather than the parent flock). When set, the same decrement-on-
-- insert pattern fires.
--
-- Existing rabbit mortality entries keep working unchanged — they
-- decrement the parent flock as before, since growout_group_id stays
-- null.

ALTER TABLE public.mortality_records
  ADD COLUMN IF NOT EXISTS growout_group_id uuid
    REFERENCES public.rabbit_growout_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS mortality_records_growout_idx
  ON public.mortality_records (growout_group_id)
  WHERE growout_group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.rabbit_decrement_growout_on_mortality()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.growout_group_id IS NOT NULL THEN
    UPDATE public.rabbit_growout_groups
       SET current_count = GREATEST(0, current_count - COALESCE(NEW.count, 0)),
           status = CASE
             WHEN GREATEST(0, current_count - COALESCE(NEW.count, 0)) = 0
               THEN 'closed'  -- distinguishes from 'sold_out' — lost the lot
             ELSE status
           END
     WHERE id = NEW.growout_group_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mortality_decrement_growout ON public.mortality_records;
CREATE TRIGGER trg_mortality_decrement_growout
  AFTER INSERT ON public.mortality_records
  FOR EACH ROW EXECUTE FUNCTION public.rabbit_decrement_growout_on_mortality();

COMMENT ON COLUMN public.mortality_records.growout_group_id IS
  'When the mortality came from a rabbit grow-out cohort. Trigger decrements the cohort''s current_count. Mutually exclusive with flock_id at the app level.';

-- ── 3. Help find growouts that need closing ────────────────────────────
-- Idempotent helper: a one-off pass that flips any active groups
-- with current_count=0 to 'sold_out'. Useful for cleaning up after
-- backfills or manual edits.
UPDATE public.rabbit_growout_groups
   SET status = 'sold_out'
 WHERE status = 'active'
   AND current_count = 0;
