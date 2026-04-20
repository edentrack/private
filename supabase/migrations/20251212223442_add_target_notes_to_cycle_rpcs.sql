/*
  # Add Target Notes to Cycle RPC Functions

  1. Changes
    - Update `get_flock_cycle_status` to return `target_reached_notes`
    - Update `get_farm_cycle_rollup` to return `target_reached_notes`

  2. Notes
    - Both functions now include the target notes field so UI can display
      what should happen when the target week is reached
*/

-- Drop and recreate get_flock_cycle_status with target_reached_notes
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
  target_reached_notes text,
  cycle_name text,
  week_length_days int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_farm_id uuid;
  v_start_date date;
  v_week_length int;
  v_target_weeks int;
  v_manual_override int;
  v_cycle_name text;
  v_target_notes text;
  v_computed_week int;
  v_current_week int;
  v_week_start date;
  v_week_end date;
  v_days_left int;
  v_label text;
  v_weeks_to_target int;
BEGIN
  SELECT fc.farm_id, fc.start_date, fc.week_length_days, fc.target_weeks,
         fc.manual_week_override, fc.cycle_name, fc.target_reached_notes
  INTO v_farm_id, v_start_date, v_week_length, v_target_weeks,
       v_manual_override, v_cycle_name, v_target_notes
  FROM flock_cycles fc
  WHERE fc.flock_id = p_flock_id;

  IF v_farm_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT is_farm_member(v_farm_id, auth.uid()) THEN
    RETURN;
  END IF;

  v_computed_week := GREATEST(1, FLOOR((CURRENT_DATE - v_start_date)::numeric / v_week_length) + 1);
  v_current_week := COALESCE(v_manual_override, v_computed_week);
  v_week_start := v_start_date + ((v_computed_week - 1) * v_week_length);
  v_week_end := v_week_start + (v_week_length - 1);
  v_days_left := GREATEST(0, v_week_end - CURRENT_DATE);

  IF v_days_left = 0 THEN
    v_label := 'Week ends today';
  ELSIF v_days_left = 1 THEN
    v_label := 'New week starts tomorrow';
  ELSE
    v_label := v_days_left || ' days left in Week ' || v_current_week;
  END IF;

  IF v_target_weeks IS NOT NULL THEN
    v_weeks_to_target := GREATEST(0, v_target_weeks - v_current_week);
  ELSE
    v_weeks_to_target := NULL;
  END IF;

  RETURN QUERY SELECT
    p_flock_id,
    v_start_date,
    v_computed_week,
    v_current_week,
    v_week_start,
    v_week_end,
    v_days_left,
    v_label,
    v_target_weeks,
    v_weeks_to_target,
    v_target_notes,
    v_cycle_name,
    v_week_length;
END;
$$;

-- Drop and recreate get_farm_cycle_rollup with target_reached_notes
DROP FUNCTION IF EXISTS get_farm_cycle_rollup(uuid);

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
  target_reached_notes text,
  has_cycle boolean,
  flock_status text,
  start_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_farm_member(p_farm_id, auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    f.id AS flock_id,
    f.name AS flock_name,
    COALESCE(f.type, f.purpose::text, 'Unknown') AS flock_type,
    CASE
      WHEN fc.id IS NOT NULL THEN
        COALESCE(fc.manual_week_override,
          GREATEST(1, FLOOR((CURRENT_DATE - fc.start_date)::numeric / fc.week_length_days) + 1)::int)
      ELSE NULL
    END AS current_week,
    CASE
      WHEN fc.id IS NOT NULL THEN
        GREATEST(0, (fc.start_date + ((GREATEST(1, FLOOR((CURRENT_DATE - fc.start_date)::numeric / fc.week_length_days))::int) * fc.week_length_days) + (fc.week_length_days - 1)) - CURRENT_DATE)::int
      ELSE NULL
    END AS days_remaining,
    CASE
      WHEN fc.id IS NULL THEN 'Cycle not set'
      WHEN GREATEST(0, (fc.start_date + ((GREATEST(1, FLOOR((CURRENT_DATE - fc.start_date)::numeric / fc.week_length_days))::int) * fc.week_length_days) + (fc.week_length_days - 1)) - CURRENT_DATE) = 0 THEN 'Week ends today'
      WHEN GREATEST(0, (fc.start_date + ((GREATEST(1, FLOOR((CURRENT_DATE - fc.start_date)::numeric / fc.week_length_days))::int) * fc.week_length_days) + (fc.week_length_days - 1)) - CURRENT_DATE) = 1 THEN 'New week starts tomorrow'
      ELSE GREATEST(0, (fc.start_date + ((GREATEST(1, FLOOR((CURRENT_DATE - fc.start_date)::numeric / fc.week_length_days))::int) * fc.week_length_days) + (fc.week_length_days - 1)) - CURRENT_DATE)::int || ' days left'
    END AS countdown_label,
    CASE
      WHEN fc.id IS NOT NULL THEN
        fc.start_date + ((GREATEST(1, FLOOR((CURRENT_DATE - fc.start_date)::numeric / fc.week_length_days))::int - 1) * fc.week_length_days)
      ELSE NULL
    END AS week_start_date,
    CASE
      WHEN fc.id IS NOT NULL THEN
        fc.start_date + ((GREATEST(1, FLOOR((CURRENT_DATE - fc.start_date)::numeric / fc.week_length_days))::int - 1) * fc.week_length_days) + (fc.week_length_days - 1)
      ELSE NULL
    END AS week_end_date,
    fc.target_weeks,
    CASE
      WHEN fc.target_weeks IS NOT NULL AND fc.id IS NOT NULL THEN
        GREATEST(0, fc.target_weeks - COALESCE(fc.manual_week_override,
          GREATEST(1, FLOOR((CURRENT_DATE - fc.start_date)::numeric / fc.week_length_days) + 1)::int))
      ELSE NULL
    END AS weeks_remaining_to_target,
    fc.target_reached_notes,
    (fc.id IS NOT NULL) AS has_cycle,
    f.status::text AS flock_status,
    fc.start_date
  FROM flocks f
  LEFT JOIN flock_cycles fc ON fc.flock_id = f.id
  WHERE f.farm_id = p_farm_id
    AND f.status = 'active'
  ORDER BY f.created_at DESC;
END;
$$;
