/*
  # Update get_farm_shifts Function

  1. Changes
    - Update the function to work with the actual worker_shifts table structure
    - Return proper data with email and name from profiles

  Note: The function was a stub before, now implementing it properly
*/

CREATE OR REPLACE FUNCTION get_farm_shifts(
  p_farm_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_status_filter text DEFAULT NULL,
  p_worker_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  farm_id uuid,
  worker_id uuid,
  worker_email text,
  worker_name text,
  shift_date date,
  start_time time,
  end_time time,
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
    ws.shift_date,
    ws.start_time,
    ws.end_time,
    ws.status,
    ws.notes,
    ws.created_at
  FROM worker_shifts ws
  LEFT JOIN profiles p ON p.id = ws.worker_id
  WHERE ws.farm_id = p_farm_id
    AND (p_start_date IS NULL OR ws.shift_date >= p_start_date)
    AND (p_end_date IS NULL OR ws.shift_date <= p_end_date)
    AND (p_status_filter IS NULL OR ws.status = p_status_filter)
    AND (p_worker_filter IS NULL OR ws.worker_id = p_worker_filter)
  ORDER BY ws.shift_date DESC, ws.start_time ASC;
END;
$$;