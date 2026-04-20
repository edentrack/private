/*
  # Fix get_farm_shifts timestamp construction

  1. Changes
    - Fix timestamp construction from date + time columns
    - Use proper PostgreSQL timestamp casting
  
  2. Purpose
    - Resolve "structure of query does not match function result type" error
    - Properly combine shift_date (date) with start_time/end_time (time) columns
*/

-- Drop existing version
DROP FUNCTION IF EXISTS get_farm_shifts(uuid, text, uuid, timestamptz, timestamptz);

-- Create the correct version with proper timestamp construction
CREATE OR REPLACE FUNCTION get_farm_shifts(
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
  worker_email text,
  worker_name text,
  worker_role text,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  notes text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ws.id,
    ws.farm_id,
    ws.worker_id,
    p.email::text as worker_email,
    p.full_name::text as worker_name,
    COALESCE(fm.role, 'worker')::text as worker_role,
    (ws.shift_date::timestamp + ws.start_time::interval)::timestamptz as start_time,
    (ws.shift_date::timestamp + ws.end_time::interval)::timestamptz as end_time,
    ws.status::text,
    ws.notes::text,
    ws.created_at::timestamptz
  FROM worker_shifts ws
  LEFT JOIN profiles p ON p.id = ws.worker_id
  LEFT JOIN farm_members fm ON fm.user_id = ws.worker_id AND fm.farm_id = ws.farm_id
  WHERE ws.farm_id = p_farm_id
    AND (p_start_date IS NULL OR (ws.shift_date::timestamp + ws.start_time::interval)::timestamptz >= p_start_date)
    AND (p_end_date IS NULL OR (ws.shift_date::timestamp + ws.end_time::interval)::timestamptz <= p_end_date)
    AND (p_status_filter IS NULL OR ws.status = p_status_filter)
    AND (p_worker_filter IS NULL OR ws.worker_id = p_worker_filter)
  ORDER BY ws.shift_date DESC, ws.start_time ASC;
END;
$$;
