/*
  # Fix Flock Cycle Status Function - Add Target Notes
  
  1. Changes
    - Drop and recreate `get_flock_cycle_status` function with `target_reached_notes` field
    - Include `target_reached_notes` in the returned data
  
  2. Purpose
    - Allow the dashboard to display target notes alongside cycle information
*/

DROP FUNCTION IF EXISTS get_flock_cycle_status(uuid);

CREATE OR REPLACE FUNCTION get_flock_cycle_status(p_flock_id uuid)
RETURNS TABLE (
  flock_id uuid,
  start_date date,
  computed_week int,
  current_week int,
  week_start_date date,
  week_end_date date,
  days_remaining int,
  countdown_label text,
  target_weeks int,
  weeks_remaining_to_target int,
  cycle_name text,
  week_length_days int,
  target_reached_notes text
) AS $$
DECLARE
  v_cycle flock_cycles%ROWTYPE;
  v_today date;
  v_days_since_start int;
  v_computed_week int;
  v_current_week int;
  v_week_start_date date;
  v_week_end_date date;
  v_days_remaining int;
  v_countdown_label text;
  v_weeks_remaining int;
BEGIN
  SELECT * INTO v_cycle
  FROM flock_cycles
  WHERE flock_cycles.flock_id = p_flock_id
  LIMIT 1;

  IF v_cycle.id IS NULL THEN
    RETURN;
  END IF;

  v_today := CURRENT_DATE;
  v_days_since_start := v_today - v_cycle.start_date;

  IF v_days_since_start < 0 THEN
    v_computed_week := 1;
  ELSE
    v_computed_week := FLOOR(v_days_since_start::numeric / v_cycle.week_length_days) + 1;
  END IF;

  v_current_week := COALESCE(v_cycle.manual_week_override, v_computed_week);
  v_week_start_date := v_cycle.start_date + ((v_current_week - 1) * v_cycle.week_length_days);
  v_week_end_date := v_week_start_date + (v_cycle.week_length_days - 1);
  v_days_remaining := GREATEST(0, v_week_end_date - v_today);

  IF v_days_remaining = 0 THEN
    v_countdown_label := 'Week ends today';
  ELSIF v_days_remaining = 1 THEN
    v_countdown_label := 'New week starts tomorrow';
  ELSE
    v_countdown_label := v_days_remaining || ' days left in Week ' || v_current_week;
  END IF;

  IF v_cycle.target_weeks IS NOT NULL THEN
    v_weeks_remaining := v_cycle.target_weeks - v_current_week;
    IF v_weeks_remaining < 0 THEN
      v_weeks_remaining := 0;
    END IF;
  ELSE
    v_weeks_remaining := NULL;
  END IF;

  RETURN QUERY SELECT
    p_flock_id,
    v_cycle.start_date,
    v_computed_week,
    v_current_week,
    v_week_start_date,
    v_week_end_date,
    v_days_remaining,
    v_countdown_label,
    v_cycle.target_weeks,
    v_weeks_remaining,
    v_cycle.cycle_name,
    v_cycle.week_length_days,
    v_cycle.target_reached_notes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
