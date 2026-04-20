/*
  # Fix get_farm_shifts function overload conflict

  1. Changes
    - Drop all existing versions of get_farm_shifts function
    - Create single version with consistent timestamptz parameters
    - Return full timestamps for start_time and end_time
  
  2. Purpose
    - Resolve "Could not choose the best candidate function" error
    - Ensure consistent parameter types across the function
*/

-- Drop all existing versions of the function
DROP FUNCTION IF EXISTS get_farm_shifts(uuid, text, uuid, date, date);
DROP FUNCTION IF EXISTS get_farm_shifts(uuid, text, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS get_farm_shifts(uuid, date, date, text, uuid);

-- Create the correct version with consistent parameter types
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
    p.email as worker_email,
    p.full_name as worker_name,
    COALESCE(fm.role, 'worker') as worker_role,
    (ws.shift_date + ws.start_time)::timestamptz as start_time,
    (ws.shift_date + ws.end_time)::timestamptz as end_time,
    ws.status,
    ws.notes,
    ws.created_at
  FROM worker_shifts ws
  LEFT JOIN profiles p ON p.id = ws.worker_id
  LEFT JOIN farm_members fm ON fm.user_id = ws.worker_id AND fm.farm_id = ws.farm_id
  WHERE ws.farm_id = p_farm_id
    AND (p_start_date IS NULL OR (ws.shift_date + ws.start_time)::timestamptz >= p_start_date)
    AND (p_end_date IS NULL OR (ws.shift_date + ws.end_time)::timestamptz <= p_end_date)
    AND (p_status_filter IS NULL OR ws.status = p_status_filter)
    AND (p_worker_filter IS NULL OR ws.worker_id = p_worker_filter)
  ORDER BY ws.shift_date DESC, ws.start_time ASC;
END;
$$;
