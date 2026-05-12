/*
  Animal headcount per farm — the primary metric for subscription
  enforcement (May 2026 rewrite).

  Until now, plan limits gated on `flock_count` per farm. That works
  for poultry where a flock = a clear unit, but breaks for rabbits
  where one doe can spawn 12 grow-out cohorts in a year and never
  trip any cap. The plan card copy already says "50 to 500 animals"
  — this view makes the enforcement match the copy.

  We sum `current_count` across:
    1. flocks WHERE status = 'active'
    2. rabbit_growout_groups WHERE status = 'active'

  Both columns track LIVE animals. Mortality decrements them as it
  happens (poultry via the mortality_records trigger; rabbits via a
  future trigger added when sales-from-cohort lands in Phase 2).

  RLS on the view: it just unions two RLS-protected tables, so each
  caller only sees rows for farms they're a member of. We expose the
  view at the table level (no policies needed — views inherit from
  underlying tables).

  Usage:
    SELECT current_count FROM farm_active_headcount WHERE farm_id = $1;
*/

CREATE OR REPLACE VIEW public.farm_active_headcount AS
SELECT
  farm_id,
  SUM(animal_count)::int AS current_count
FROM (
  -- Active flocks (poultry, fish, rabbits-as-flock)
  SELECT
    farm_id,
    COALESCE(current_count, 0) AS animal_count
  FROM public.flocks
  WHERE status = 'active'

  UNION ALL

  -- Active rabbit grow-out groups (cohorts spawned from litters or
  -- bought-in groups). Their current_count is independent of the
  -- parent rabbit flock.
  SELECT
    farm_id,
    COALESCE(current_count, 0) AS animal_count
  FROM public.rabbit_growout_groups
  WHERE status = 'active'
) AS combined
GROUP BY farm_id;

COMMENT ON VIEW public.farm_active_headcount IS
  'Sum of live animal counts per farm: active flocks + active rabbit growout groups. Drives plan-tier enforcement via MAX_ACTIVE_ANIMALS_PER_TIER. Updated implicitly as the underlying current_count columns change.';
