/*
  Farm Journal — auto-entry triggers.

  Three Postgres triggers + one helper function. Each watches a
  particular table and inserts a journal_entries row when a notable
  condition fires. All triggers are SECURITY DEFINER so they bypass
  the journal_entries RLS that requires author_id = auth.uid() — they
  set author_id NULL and author_kind = 'eden' so the timeline renders
  the sparkle.

  Three triggers:

  1. mortality_spike — fires when a mortality_logs row pushes the
     last-24h count above 2% of the flock's current_count. Body reads
     "Heads up: 23 birds (5.2%) lost in the last 24 hours on Flock 1.
     Worth checking water and recent feed."

  2. flock_archived — fires when a flock's status flips from 'active'
     to 'archived' (cycle close-out). Body summarises the cycle's P&L
     and mortality rate. Calls into a helper SQL function that pulls
     totals from sales + expenses + mortality_logs.

  3. vet_withdrawal_clear — runs once daily via cron (separate edge
     function) so we can phrase the body as a forward-looking notice.
     This migration just adds a column to vet_logs tracking whether
     we've already announced the clear, so the cron is idempotent.

  Each trigger is wrapped in EXCEPTION WHEN OTHERS so a logic bug
  here never breaks the underlying mutation. Worst case, an auto-
  entry doesn't fire — the mortality / archive / vet log still saves.
*/

-- ── 1. Helper: compute last-24h mortality % for a flock ────────────

CREATE OR REPLACE FUNCTION public.flock_mortality_pct_24h(
  p_flock_id uuid
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_24h_count integer;
  v_current_count integer;
BEGIN
  SELECT COALESCE(SUM(count), 0) INTO v_24h_count
    FROM mortality_logs
   WHERE flock_id = p_flock_id
     AND created_at >= now() - interval '24 hours';

  SELECT current_count INTO v_current_count
    FROM flocks
   WHERE id = p_flock_id;

  IF v_current_count IS NULL OR v_current_count = 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND((v_24h_count::numeric / v_current_count::numeric) * 100, 2);
END;
$$;

-- ── 2. Mortality spike trigger ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.journal_mortality_spike_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pct numeric;
  v_24h_count integer;
  v_flock_name text;
  v_already_alerted boolean;
BEGIN
  -- Wrap everything in exception handler — bug here must never block
  -- the actual mortality log insert.
  BEGIN
    v_pct := flock_mortality_pct_24h(NEW.flock_id);
    IF v_pct < 2.0 THEN RETURN NEW; END IF;

    SELECT COALESCE(SUM(count), 0) INTO v_24h_count
      FROM mortality_logs
     WHERE flock_id = NEW.flock_id
       AND created_at >= now() - interval '24 hours';

    SELECT name INTO v_flock_name FROM flocks WHERE id = NEW.flock_id;

    -- De-duplicate: only one mortality_spike entry per flock per 24h.
    SELECT EXISTS(
      SELECT 1 FROM journal_entries
       WHERE flock_id = NEW.flock_id
         AND author_kind = 'eden'
         AND entry_type = 'auto_summary'
         AND metadata->>'kind' = 'mortality_spike'
         AND created_at >= now() - interval '24 hours'
    ) INTO v_already_alerted;
    IF v_already_alerted THEN RETURN NEW; END IF;

    INSERT INTO journal_entries (
      farm_id, flock_id, author_id, author_role, author_kind,
      channel, entry_type, title, body, metadata
    ) VALUES (
      NEW.farm_id,
      NEW.flock_id,
      NULL, NULL, 'eden',
      'notes', 'auto_summary',
      'Mortality spike on ' || COALESCE(v_flock_name, 'flock'),
      'Heads up — ' || v_24h_count || ' losses on ' || COALESCE(v_flock_name, 'this flock') ||
      ' in the last 24 hours (' || v_pct::text || '%). Worth checking water source, recent feed batch, and temperature.',
      jsonb_build_object('kind', 'mortality_spike', 'pct_24h', v_pct, 'count_24h', v_24h_count)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log and swallow. Don't propagate.
    RAISE WARNING 'journal_mortality_spike_check failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_mortality_spike ON public.mortality_logs;
CREATE TRIGGER trg_journal_mortality_spike
  AFTER INSERT ON public.mortality_logs
  FOR EACH ROW EXECUTE FUNCTION public.journal_mortality_spike_check();

-- ── 3. Flock archive (cycle close-out) trigger ──────────────────────

CREATE OR REPLACE FUNCTION public.journal_flock_archived_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_revenue numeric := 0;
  v_total_expenses numeric := 0;
  v_total_mortality integer := 0;
  v_initial_count integer := 0;
  v_currency text;
  v_pnl numeric;
  v_mortality_pct numeric;
BEGIN
  -- Only fire on status transition active → archived
  IF NEW.status IS DISTINCT FROM 'archived' THEN RETURN NEW; END IF;
  IF OLD.status = 'archived' THEN RETURN NEW; END IF;

  BEGIN
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_revenue
      FROM bird_sales WHERE flock_id = NEW.id;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_expenses
      FROM expenses WHERE flock_id = NEW.id;

    SELECT COALESCE(SUM(count), 0) INTO v_total_mortality
      FROM mortality_logs WHERE flock_id = NEW.id;

    v_initial_count := COALESCE(NEW.initial_count, 0);
    IF v_initial_count > 0 THEN
      v_mortality_pct := ROUND((v_total_mortality::numeric / v_initial_count) * 100, 1);
    ELSE
      v_mortality_pct := 0;
    END IF;

    v_pnl := v_total_revenue - v_total_expenses;
    v_currency := COALESCE(
      (SELECT currency_code FROM farms WHERE id = NEW.farm_id),
      (SELECT currency FROM farms WHERE id = NEW.farm_id),
      'XAF'
    );

    INSERT INTO journal_entries (
      farm_id, flock_id, author_id, author_role, author_kind,
      channel, entry_type, title, body, metadata
    ) VALUES (
      NEW.farm_id,
      NEW.id,
      NULL, NULL, 'eden',
      'notes', 'milestone',
      'Cycle close-out: ' || COALESCE(NEW.name, 'flock'),
      'Closed ' || COALESCE(NEW.name, 'flock') ||
      ' — revenue ' || v_total_revenue::text || ' ' || v_currency ||
      ', expenses ' || v_total_expenses::text || ' ' || v_currency ||
      ', net ' || CASE WHEN v_pnl >= 0 THEN '+' ELSE '' END || v_pnl::text || ' ' || v_currency ||
      '. Mortality ' || v_total_mortality::text || ' of ' || v_initial_count::text ||
      ' (' || v_mortality_pct::text || '%).',
      jsonb_build_object(
        'kind', 'cycle_closeout',
        'revenue', v_total_revenue,
        'expenses', v_total_expenses,
        'pnl', v_pnl,
        'mortality_count', v_total_mortality,
        'mortality_pct', v_mortality_pct,
        'initial_count', v_initial_count,
        'currency', v_currency,
        -- Chart payload for ChartBlock.tsx. Three-bar P&L: Revenue
        -- (positive), Expenses (rendered as a negative bar that dips
        -- below the zero line so it reads as money out), Net (green
        -- if positive, red if negative). currency travels alongside
        -- so the y-axis labels render correctly.
        'chart', jsonb_build_object(
          'type', 'bar',
          'label', 'Cycle P&L',
          'currency', v_currency,
          'points', jsonb_build_array(
            jsonb_build_object('x', 'Revenue',  'y', v_total_revenue,   'color', '#3D5F42'),
            jsonb_build_object('x', 'Expenses', 'y', -v_total_expenses, 'color', '#dc2626'),
            jsonb_build_object('x', 'Net',      'y', v_pnl,             'color', CASE WHEN v_pnl >= 0 THEN '#3D5F42' ELSE '#dc2626' END)
          )
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'journal_flock_archived_summary failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_flock_archived ON public.flocks;
CREATE TRIGGER trg_journal_flock_archived
  AFTER UPDATE ON public.flocks
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.journal_flock_archived_summary();

-- ── 4. Vet withdrawal clear column ──────────────────────────────────
-- The cron edge function (see ../functions/journal-cron) reads vet_logs
-- and fires a journal entry on the day a withdrawal period clears.
-- This column makes the cron idempotent — once announced=true, skip.

ALTER TABLE public.vet_logs
  ADD COLUMN IF NOT EXISTS journal_clear_announced boolean DEFAULT false;

COMMENT ON COLUMN public.vet_logs.journal_clear_announced IS
  'True once the journal_cron edge function has posted the "withdrawal clear" notice. Prevents duplicate notices on cron retries.';
