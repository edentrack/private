/*
  # Fix get_farm_shifts Email Type Cast

  1. Changes
    - Cast auth.users.email from varchar to text to match function return type
    - Column 5 (worker_email) expects text but receives character varying

  2. Issue
    - PostgreSQL auth.users.email is varchar, but function returns text
    - Need explicit cast to text for type compatibility
*/

-- Drop and recreate with proper type casting
DROP FUNCTION IF EXISTS public.get_farm_shifts(uuid, text, uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_farm_shifts(
  p_farm_id uuid,
  p_status_filter text DEFAULT NULL,
  p_worker_filter uuid DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  farm_id uuid,
  worker_id uuid,
  worker_name text,
  worker_email text,
  worker_role text,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  created_by uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
BEGIN
  -- Check if actor has access to this farm
  SELECT fm.role INTO v_actor_role
  FROM farm_members fm
  WHERE fm.farm_id = p_farm_id
    AND fm.user_id = v_actor
    AND fm.is_active = true;

  -- If not a member at all, return empty
  IF v_actor_role IS NULL THEN
    RETURN;
  END IF;

  -- If not owner/manager, only show their own shifts
  IF v_actor_role NOT IN ('owner', 'manager') THEN
    RETURN QUERY
    SELECT
      ws.id,
      ws.farm_id,
      ws.worker_id,
      p.full_name AS worker_name,
      COALESCE(u.email::text, '') AS worker_email,
      fm.role AS worker_role,
      ws.start_time,
      ws.end_time,
      ws.status,
      ws.created_by,
      ws.created_at
    FROM worker_shifts ws
    JOIN profiles p ON p.id = ws.worker_id
    LEFT JOIN auth.users u ON u.id = ws.worker_id
    JOIN farm_members fm ON fm.user_id = ws.worker_id AND fm.farm_id = ws.farm_id
    WHERE ws.farm_id = p_farm_id
      AND ws.worker_id = v_actor
      AND (p_status_filter IS NULL OR ws.status = p_status_filter)
      AND (p_start_date IS NULL OR ws.start_time >= p_start_date)
      AND (p_end_date IS NULL OR ws.end_time <= p_end_date)
    ORDER BY ws.start_time DESC;
  ELSE
    -- Owner/manager sees all shifts with filters
    RETURN QUERY
    SELECT
      ws.id,
      ws.farm_id,
      ws.worker_id,
      p.full_name AS worker_name,
      COALESCE(u.email::text, '') AS worker_email,
      fm.role AS worker_role,
      ws.start_time,
      ws.end_time,
      ws.status,
      ws.created_by,
      ws.created_at
    FROM worker_shifts ws
    JOIN profiles p ON p.id = ws.worker_id
    LEFT JOIN auth.users u ON u.id = ws.worker_id
    JOIN farm_members fm ON fm.user_id = ws.worker_id AND fm.farm_id = ws.farm_id
    WHERE ws.farm_id = p_farm_id
      AND (p_status_filter IS NULL OR ws.status = p_status_filter)
      AND (p_worker_filter IS NULL OR ws.worker_id = p_worker_filter)
      AND (p_start_date IS NULL OR ws.start_time >= p_start_date)
      AND (p_end_date IS NULL OR ws.end_time <= p_end_date)
    ORDER BY ws.start_time DESC;
  END IF;
END;
$$;
