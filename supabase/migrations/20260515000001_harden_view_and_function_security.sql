/*
  Security hardening for the May 2026 rabbit lifecycle + headcount work.

  Two distinct fixes, both flagged by Supabase's database linter
  (`supabase__get_advisors`) on 2026-05-15:

  ## 1. farm_active_headcount: SECURITY DEFINER → INVOKER (ERROR)

  The view was created without an explicit security clause, which on
  Postgres 15+ in Supabase defaults to SECURITY DEFINER. That means
  a user querying the view runs it with the VIEW CREATOR's permissions,
  not their own — so a user who only has access to one farm could in
  principle see headcounts from every farm if the view is read
  directly (the in-app HeadcountBanner + Eden's planAwareness prompt
  both scope per-farm via `.eq('farm_id', ...)`, but RLS should always
  be enforced at the data layer too).

  Fix: drop + recreate the view with `WITH (security_invoker = true)`,
  so the underlying flocks + rabbit_growout_groups RLS policies are
  applied against the QUERYING user. Both consumers continue to work
  because both consult the user's farm membership via farm_members
  RLS, which inherits correctly.

  ## 2. Trigger functions: pin search_path (WARN)

  Four trigger functions I added had mutable search_path, which is a
  Postgres function-hijack vector — a malicious schema in the user's
  search_path could shadow `public.<table>` references and run
  unintended code. Mitigation: pin search_path inside each function
  with `SET search_path = public, pg_catalog`.

  Functions affected:
    - rabbit_create_growout_from_litter  (Phase 1 rabbit lifecycle)
    - rabbit_decrement_growout_on_sale   (Phase 2)
    - rabbit_decrement_growout_on_mortality (Phase 2)
    - journal_entries_touch_updated_at   (Farm Journal Phase 1)

  Each function is recreated verbatim with the SET clause added — the
  body logic is unchanged, so trigger semantics stay identical.

  Pre-existing security findings NOT addressed here (not part of my
  work this session):
    - 3 other SECURITY DEFINER views (other_inventory, feed_stock,
      sales_invoices) — same root cause, same fix shape, but each
      probably has a reason it was set up that way originally.
    - 5 service_role policies with always-true WITH CHECK — these are
      intentional. service_role bypasses RLS by design (used by edge
      functions running with the service-role key). False positive.
    - auth.leaked_password_protection disabled — flip on in Auth
      settings, no migration needed.
*/

-- ── 1. farm_active_headcount: SECURITY INVOKER ─────────────────────────
DROP VIEW IF EXISTS public.farm_active_headcount;
CREATE VIEW public.farm_active_headcount
WITH (security_invoker = true)
AS
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
  -- Active rabbit grow-out groups
  SELECT
    farm_id,
    COALESCE(current_count, 0) AS animal_count
  FROM public.rabbit_growout_groups
  WHERE status = 'active'
) AS combined
GROUP BY farm_id;

COMMENT ON VIEW public.farm_active_headcount IS
  'Sum of live animal counts per farm: active flocks + active rabbit growout groups. SECURITY INVOKER — respects each user''s RLS on the underlying tables.';

-- ── 2. Pin search_path on the 4 trigger functions ──────────────────────

CREATE OR REPLACE FUNCTION public.rabbit_create_growout_from_litter()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
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

CREATE OR REPLACE FUNCTION public.rabbit_decrement_growout_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
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

CREATE OR REPLACE FUNCTION public.rabbit_decrement_growout_on_mortality()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.growout_group_id IS NOT NULL THEN
    UPDATE public.rabbit_growout_groups
       SET current_count = GREATEST(0, current_count - COALESCE(NEW.count, 0)),
           status = CASE
             WHEN GREATEST(0, current_count - COALESCE(NEW.count, 0)) = 0
               THEN 'closed'
             ELSE status
           END
     WHERE id = NEW.growout_group_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.journal_entries_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
