/*
  # Update calculate_payroll Function

  1. Changes
    - Update the function to work with actual worker_shifts and worker_pay_rates tables
    - Calculate hours worked and total pay based on shifts and rates

  Note: The function was a stub before, now implementing it properly
*/

CREATE OR REPLACE FUNCTION calculate_payroll(
  p_farm_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  worker_id uuid,
  worker_name text,
  worker_email text,
  total_hours numeric,
  hourly_rate numeric,
  total_pay numeric,
  shifts_worked integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ws.worker_id,
    p.full_name as worker_name,
    p.email as worker_email,
    SUM(
      EXTRACT(EPOCH FROM (ws.end_time - ws.start_time)) / 3600
    )::numeric as total_hours,
    COALESCE(
      (
        SELECT wpr.rate_amount 
        FROM worker_pay_rates wpr 
        WHERE wpr.worker_id = ws.worker_id 
          AND wpr.farm_id = p_farm_id
          AND wpr.effective_from <= p_end_date
          AND (wpr.effective_to IS NULL OR wpr.effective_to >= p_start_date)
        ORDER BY wpr.effective_from DESC 
        LIMIT 1
      ), 
      0
    )::numeric as hourly_rate,
    (
      SUM(EXTRACT(EPOCH FROM (ws.end_time - ws.start_time)) / 3600) *
      COALESCE(
        (
          SELECT wpr.rate_amount 
          FROM worker_pay_rates wpr 
          WHERE wpr.worker_id = ws.worker_id 
            AND wpr.farm_id = p_farm_id
            AND wpr.effective_from <= p_end_date
            AND (wpr.effective_to IS NULL OR wpr.effective_to >= p_start_date)
          ORDER BY wpr.effective_from DESC 
          LIMIT 1
        ), 
        0
      )
    )::numeric as total_pay,
    COUNT(ws.id)::integer as shifts_worked
  FROM worker_shifts ws
  LEFT JOIN profiles p ON p.id = ws.worker_id
  WHERE ws.farm_id = p_farm_id
    AND ws.shift_date >= p_start_date
    AND ws.shift_date <= p_end_date
    AND ws.status = 'completed'
  GROUP BY ws.worker_id, p.full_name, p.email
  ORDER BY p.full_name;
END;
$$;