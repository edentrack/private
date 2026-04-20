/*
  # Create Flock Cycle Status RPC Function

  1. New Function
    - `get_flock_cycle_status(p_flock_id uuid)` - calculates current week and countdown for a flock
    
  2. Returns
    - flock_id (uuid)
    - start_date (date)
    - computed_week (int) - calculated from start_date
    - current_week (int) - manual_week_override or computed_week
    - week_start_date (date)
    - week_end_date (date)
    - days_remaining (int) - 0 to week_length_days-1
    - countdown_label (text) - human-readable countdown
    - target_weeks (int)
    - weeks_remaining_to_target (int) - nullable
    - cycle_name (text)
    - week_length_days (int)
    
  3. Computation Logic
    - computed_week = floor((today - start_date) / week_length_days) + 1
    - week_start_date = start_date + (current_week - 1) * week_length_days
    - week_end_date = week_start_date + (week_length_days - 1)
    - days_remaining = greatest(0, week_end_date - today)
*/

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
  week_length_days int
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
  -- Get the flock cycle
  SELECT * INTO v_cycle
  FROM flock_cycles
  WHERE flock_cycles.flock_id = p_flock_id
  LIMIT 1;

  -- If no cycle exists, return null
  IF v_cycle.id IS NULL THEN
    RETURN;
  END IF;

  -- Get today's date
  v_today := CURRENT_DATE;

  -- Calculate days since start
  v_days_since_start := v_today - v_cycle.start_date;

  -- Calculate computed week (1-based)
  IF v_days_since_start < 0 THEN
    v_computed_week := 1; -- Before start date, show as Week 1
  ELSE
    v_computed_week := FLOOR(v_days_since_start::numeric / v_cycle.week_length_days) + 1;
  END IF;

  -- Use manual override if set, otherwise use computed
  v_current_week := COALESCE(v_cycle.manual_week_override, v_computed_week);

  -- Calculate week boundaries based on current_week
  v_week_start_date := v_cycle.start_date + ((v_current_week - 1) * v_cycle.week_length_days);
  v_week_end_date := v_week_start_date + (v_cycle.week_length_days - 1);

  -- Calculate days remaining in current week
  v_days_remaining := GREATEST(0, v_week_end_date - v_today);

  -- Generate countdown label
  IF v_days_remaining = 0 THEN
    v_countdown_label := 'Week ends today';
  ELSIF v_days_remaining = 1 THEN
    v_countdown_label := 'New week starts tomorrow';
  ELSE
    v_countdown_label := v_days_remaining || ' days left in Week ' || v_current_week;
  END IF;

  -- Calculate weeks remaining to target if target exists
  IF v_cycle.target_weeks IS NOT NULL THEN
    v_weeks_remaining := v_cycle.target_weeks - v_current_week;
    IF v_weeks_remaining < 0 THEN
      v_weeks_remaining := 0;
    END IF;
  ELSE
    v_weeks_remaining := NULL;
  END IF;

  -- Return the result
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
    v_cycle.week_length_days;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;