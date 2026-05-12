/*
  Rabbits — Phase 1 of the lifecycle rethink.

  Background (May 2026): rabbit farms don't fit the uniform-batch
  model that works for poultry / fish. A doe in one corner has kits
  monthly; those kits grow out for 8-12 weeks; meanwhile other
  cohorts of different ages are running in parallel. So we need:

    1. A "grow-out group" concept — a cohort of rabbits of a known
       age, born or bought-in on a known date. Mortality / weight /
       feed all attach to grow-out groups. Each group ends in a
       sale (or replacement of breeder stock).

    2. Sales (not "harvests" — rabbits are sold, not harvested).
       A sale references EITHER a grow-out group (for meat rabbits)
       OR a named individual rabbit (for breeder-stock sales),
       OR neither (free-form count for farmers who don't yet use
       the grow-out workflow). Same financial fields as before.

  This migration:
    - Renames table `rabbit_harvest_records` → `rabbit_sales`,
      column `harvested_at` → `sold_at`. Data is preserved.
    - Creates `rabbit_growout_groups`.
    - Adds nullable `source_growout_group_id` and `source_rabbit_id`
      to `rabbit_sales` (FK to growout_groups + rabbits respectively).
    - Adds a trigger that auto-creates a grow-out group whenever a
      `litters` row is inserted with kits_born_alive > 0. The new
      group's name is "Doe-tag - Mon DD" and its starting_count =
      kits_born_alive.

  Phase 2 (separate PR) will: rewrite the sales UI to pick from
  grow-outs, add a Grow-out Groups page with mortality/weight rolls,
  decrement growout.current_count on each sale via trigger, and
  introduce the species-aware "reproducer" template that lets us
  ship pigs / goats / grasscutters by config.
*/

-- ── 1. Rename harvest → sales ──────────────────────────────────────────

ALTER TABLE IF EXISTS public.rabbit_harvest_records RENAME TO rabbit_sales;
ALTER TABLE IF EXISTS public.rabbit_sales RENAME COLUMN harvested_at TO sold_at;

-- Older index on harvested_at, if it exists, follows the rename
-- automatically. The generated `dressing_pct` column depends only on
-- the two weight columns, which are unchanged.

COMMENT ON TABLE public.rabbit_sales IS
  'Rabbit sales (renamed from rabbit_harvest_records May 2026). Each row records what was sold: a count, weights, price, buyer, payment status. Optionally links to source_growout_group_id (a cohort) or source_rabbit_id (a named breeder).';

-- ── 2. rabbit_growout_groups ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rabbit_growout_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  flock_id        uuid REFERENCES public.flocks(id) ON DELETE SET NULL,
  -- Display name. We seed it as "Doe-tag - Mon DD" for litter-born
  -- groups; user can rename. For bought-in groups the farmer writes
  -- their own name e.g. "Apr buy-in".
  name            text NOT NULL,
  -- Where this group came from.
  source_litter_id uuid REFERENCES public.litters(id) ON DELETE SET NULL,
  -- Birth / start date of the cohort. Litter-born = kindling_date.
  -- For bought-in this is the date of acquisition. Drives age display
  -- in the UI ("8 weeks old").
  birth_date      date,
  starting_count  int NOT NULL DEFAULT 0,
  -- Maintained by app logic (mortality decrements, sales decrement).
  -- A future trigger pass will sync this automatically from
  -- mortality_records + rabbit_sales counts.
  current_count   int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'sold_out', 'closed')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rabbit_growout_groups_farm_idx
  ON public.rabbit_growout_groups (farm_id, status, birth_date DESC);

CREATE INDEX IF NOT EXISTS rabbit_growout_groups_litter_idx
  ON public.rabbit_growout_groups (source_litter_id)
  WHERE source_litter_id IS NOT NULL;

ALTER TABLE public.rabbit_growout_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm members can manage rabbit_growout_groups"
  ON public.rabbit_growout_groups FOR ALL
  USING (
    farm_id IN (
      SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.rabbit_growout_groups IS
  'A cohort of rabbits of known age. Created automatically when a litter is logged (one group per litter), or manually for bought-in groups. Same shape works for pigs/goats/sheep when we generalize.';

-- ── 3. Link sales to source (cohort OR individual) ─────────────────────

ALTER TABLE public.rabbit_sales
  ADD COLUMN IF NOT EXISTS source_growout_group_id uuid
    REFERENCES public.rabbit_growout_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_rabbit_id uuid
    REFERENCES public.rabbits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rabbit_sales_growout_idx
  ON public.rabbit_sales (source_growout_group_id)
  WHERE source_growout_group_id IS NOT NULL;

COMMENT ON COLUMN public.rabbit_sales.source_growout_group_id IS
  'When the sale was from a grow-out cohort. Mutually exclusive with source_rabbit_id at the app level (no DB check — preserves freedom to enter raw counts without a source).';
COMMENT ON COLUMN public.rabbit_sales.source_rabbit_id IS
  'When a named individual (breeder) was sold. Mutually exclusive with source_growout_group_id at the app level.';

-- ── 4. Auto-create growout group when a litter is logged ───────────────
--
-- Fires AFTER INSERT on litters (so the NEW row's id is final). Only
-- creates a group if kits_born_alive > 0; if a doe loses the whole
-- litter at kindling there's nothing to grow out.
CREATE OR REPLACE FUNCTION public.rabbit_create_growout_from_litter()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kits_born_alive > 0 THEN
    INSERT INTO public.rabbit_growout_groups (
      farm_id, name, source_litter_id, birth_date,
      starting_count, current_count
    ) VALUES (
      NEW.farm_id,
      NEW.doe_tag || ' - ' || to_char(NEW.kindling_date, 'Mon DD'),
      NEW.id,
      NEW.kindling_date,
      NEW.kits_born_alive,
      NEW.kits_born_alive
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_litters_create_growout ON public.litters;
CREATE TRIGGER trg_litters_create_growout
  AFTER INSERT ON public.litters
  FOR EACH ROW EXECUTE FUNCTION public.rabbit_create_growout_from_litter();

-- ── 5. Backfill: create growout groups for existing litters ────────────
-- Only run for litters that don't already have an associated group
-- (in case this migration is re-applied or a group was created manually).
INSERT INTO public.rabbit_growout_groups (
  farm_id, name, source_litter_id, birth_date, starting_count, current_count
)
SELECT
  l.farm_id,
  l.doe_tag || ' - ' || to_char(l.kindling_date, 'Mon DD'),
  l.id,
  l.kindling_date,
  l.kits_born_alive,
  COALESCE(l.kits_weaned, l.kits_born_alive)
FROM public.litters l
LEFT JOIN public.rabbit_growout_groups g ON g.source_litter_id = l.id
WHERE g.id IS NULL
  AND l.kits_born_alive > 0;
