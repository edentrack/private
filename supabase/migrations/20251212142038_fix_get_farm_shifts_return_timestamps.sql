/*
  # Fix get_farm_shifts to return full timestamps

  1. Changes
    - Update get_farm_shifts function to combine shift_date with start_time and end_time
    - Return full timestamp values instead of separate date and time fields
    - Add worker_role to the return data
  
  2. Purpose
    - Fix "Invalid Date" display issue in shifts table
    - Ensure frontend can properly format start and end times
*/

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
  shift_date date,
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
    p.email as worker_email,
    p.full_name as worker_name,
    fm.role as worker_role,
    ws.shift_date,
    (ws.shift_date + ws.start_time)::timestamptz as start_time,
    (ws.shift_date + ws.end_time)::timestamptz as end_time,
    ws.status,
    ws.notes,
    ws.created_at
  FROM worker_shifts ws
  LEFT JOIN profiles p ON p.id = ws.worker_id
  LEFT JOIN farm_members fm ON fm.user_id = ws.worker_id AND fm.farm_id = ws.farm_id
  WHERE ws.farm_id = p_farm_id
    AND (p_start_date IS NULL OR ws.shift_date >= p_start_date::date)
    AND (p_end_date IS NULL OR ws.shift_date <= p_end_date::date)
    AND (p_status_filter IS NULL OR ws.status = p_status_filter)
    AND (p_worker_filter IS NULL OR ws.worker_id = p_worker_filter)
  ORDER BY ws.shift_date DESC, ws.start_time ASC;
END;
$$;
