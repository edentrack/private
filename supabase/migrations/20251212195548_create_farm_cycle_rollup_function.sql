/*
  # Create Farm Cycle Rollup RPC Function

  1. New Function
    - `get_farm_cycle_rollup(p_farm_id uuid)` - returns cycle status for all flocks in a farm
    
  2. Returns one row per flock with:
    - flock_id (uuid)
    - flock_name (text)
    - flock_type (text) - broiler/layer
    - current_week (int)
    - days_remaining (int)
    - countdown_label (text)
    - week_start_date (date)
    - week_end_date (date)
    - target_weeks (int)
    - weeks_remaining_to_target (int)
    - has_cycle (boolean) - whether the flock has a cycle configured
    - flock_status (text) - active/archived
    
  3. Notes
    - Only returns active flocks
    - Flocks without cycles still appear but with has_cycle = false
    - Client can compute totals from the returned list
*/

CREATE OR REPLACE FUNCTION get_farm_cycle_rollup(p_farm_id uuid)
RETURNS TABLE (
  flock_id uuid,
  flock_name text,
  flock_type text,
  current_week int,
  days_remaining int,
  countdown_label text,
  week_start_date date,
  week_end_date date,
  target_weeks int,
  weeks_remaining_to_target int,
  has_cycle boolean,
  flock_status text,
  start_date date
) AS $$
DECLARE
  v_flock RECORD;
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
  v_today := CURRENT_DATE;

  -- Loop through all active flocks for the farm
  FOR v_flock IN 
    SELECT f.id, f.name, f.type, f.status
    FROM flocks f
    WHERE f.farm_id = p_farm_id
      AND f.status = 'active'
    ORDER BY f.created_at DESC
  LOOP
    -- Try to get the cycle for this flock
    SELECT * INTO v_cycle
    FROM flock_cycles fc
    WHERE fc.flock_id = v_flock.id
    LIMIT 1;

    IF v_cycle.id IS NOT NULL THEN
      -- Calculate cycle status
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
        v_countdown_label := v_days_remaining || ' days left';
      END IF;

      IF v_cycle.target_weeks IS NOT NULL THEN
        v_weeks_remaining := GREATEST(0, v_cycle.target_weeks - v_current_week);
      ELSE
        v_weeks_remaining := NULL;
      END IF;

      RETURN QUERY SELECT
        v_flock.id,
        v_flock.name,
        v_flock.type::text,
        v_current_week,
        v_days_remaining,
        v_countdown_label,
        v_week_start_date,
        v_week_end_date,
        v_cycle.target_weeks,
        v_weeks_remaining,
        true,
        v_flock.status::text,
        v_cycle.start_date;
    ELSE
      -- No cycle for this flock
      RETURN QUERY SELECT
        v_flock.id,
        v_flock.name,
        v_flock.type::text,
        NULL::int,
        NULL::int,
        'Cycle not set'::text,
        NULL::date,
        NULL::date,
        NULL::int,
        NULL::int,
        false,
        v_flock.status::text,
        NULL::date;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;