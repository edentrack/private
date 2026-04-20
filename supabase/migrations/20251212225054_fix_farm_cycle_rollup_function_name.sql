/*
  # Fix Farm Cycle Rollup Function Name
  
  1. Changes
    - Update `get_farm_cycle_rollup` to use the correct helper function name
    - Change `is_farm_member(p_farm_id, auth.uid())` to `user_is_farm_member(p_farm_id)`
  
  2. Purpose
    - Fix the 404 error when calling get_farm_cycle_rollup
    - The function was calling a non-existent helper function
*/

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
  IF NOT user_is_farm_member(p_farm_id) THEN
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
