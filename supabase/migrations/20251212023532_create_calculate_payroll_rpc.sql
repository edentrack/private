/*
  # Create Calculate Payroll RPC

  1. New Functions
    - `calculate_payroll` - Calculates payroll for all workers in a date range
    
  2. Behavior
    - Gets all active workers with pay rates for the farm
    - For each worker, calculates total hours from completed shifts
    - For hourly workers:
      - Hours over 40 per week are considered overtime
      - Calculates regular_pay and overtime_pay separately
    - For salaried workers:
      - Pay is prorated based on days in range vs 30-day month
      - No overtime calculation
    - Returns table with comprehensive payroll data
    
  3. Return Columns
    - worker_id, worker_name, worker_email, pay_type
    - regular_hours, overtime_hours
    - regular_pay, overtime_pay, total_pay
    - currency
    
  4. Security
    - Only farm owners and managers can calculate payroll
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
  pay_type text,
  regular_hours numeric,
  overtime_hours numeric,
  regular_pay numeric,
  overtime_pay numeric,
  total_pay numeric,
  currency text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_worker record;
  v_total_hours numeric;
  v_regular_hours numeric;
  v_overtime_hours numeric;
  v_regular_pay numeric;
  v_overtime_pay numeric;
  v_total_pay numeric;
  v_days_in_range numeric;
  v_weeks_in_range numeric;
  v_weekly_overtime_threshold numeric := 40.0;
BEGIN
  -- Check if actor is owner or manager
  SELECT fm.role INTO v_actor_role
  FROM farm_members fm
  WHERE fm.farm_id = p_farm_id
    AND fm.user_id = v_actor_id
    AND fm.is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only farm owners and managers can calculate payroll';
  END IF;

  -- Calculate days in range
  v_days_in_range := (p_end_date - p_start_date + 1)::numeric;
  v_weeks_in_range := v_days_in_range / 7.0;

  -- Loop through all active workers with pay rates
  FOR v_worker IN
    SELECT DISTINCT
      wpr.user_id,
      wpr.pay_type,
      wpr.hourly_rate,
      wpr.overtime_rate,
      wpr.monthly_salary,
      wpr.currency,
      p.full_name,
      COALESCE(u.email::text, '') as email
    FROM worker_pay_rates wpr
    JOIN profiles p ON p.id = wpr.user_id
    LEFT JOIN auth.users u ON u.id = wpr.user_id
    WHERE wpr.farm_id = p_farm_id
      AND wpr.effective_from <= p_end_date
      AND wpr.id = (
        SELECT id FROM worker_pay_rates wpr2
        WHERE wpr2.farm_id = wpr.farm_id
          AND wpr2.user_id = wpr.user_id
          AND wpr2.effective_from <= p_end_date
        ORDER BY wpr2.effective_from DESC
        LIMIT 1
      )
  LOOP
    -- Calculate total hours worked from completed shifts
    SELECT COALESCE(
      SUM(
        EXTRACT(EPOCH FROM (ws.end_time - ws.start_time)) / 3600.0
      ),
      0
    ) INTO v_total_hours
    FROM worker_shifts ws
    WHERE ws.farm_id = p_farm_id
      AND ws.worker_id = v_worker.user_id
      AND ws.status IN ('completed', 'in_progress')
      AND ws.start_time::date >= p_start_date
      AND ws.end_time::date <= p_end_date;

    -- Calculate pay based on pay type
    IF v_worker.pay_type = 'hourly' THEN
      -- Hourly worker: calculate regular and overtime hours
      -- Simple rule: hours over 40 per week are overtime
      
      IF v_total_hours > (v_weekly_overtime_threshold * v_weeks_in_range) THEN
        v_regular_hours := v_weekly_overtime_threshold * v_weeks_in_range;
        v_overtime_hours := v_total_hours - v_regular_hours;
      ELSE
        v_regular_hours := v_total_hours;
        v_overtime_hours := 0;
      END IF;

      v_regular_pay := ROUND(v_regular_hours * v_worker.hourly_rate, 2);
      v_overtime_pay := ROUND(v_overtime_hours * v_worker.overtime_rate, 2);
      v_total_pay := v_regular_pay + v_overtime_pay;

    ELSIF v_worker.pay_type = 'salary' THEN
      -- Salaried worker: prorate based on days in range
      v_regular_hours := v_total_hours;
      v_overtime_hours := 0;
      
      -- Prorate salary based on 30-day month
      v_regular_pay := ROUND(v_worker.monthly_salary * (v_days_in_range / 30.0), 2);
      v_overtime_pay := 0;
      v_total_pay := v_regular_pay;
    END IF;

    -- Return the calculated payroll row
    worker_id := v_worker.user_id;
    worker_name := v_worker.full_name;
    worker_email := v_worker.email;
    pay_type := v_worker.pay_type;
    regular_hours := ROUND(v_regular_hours, 2);
    overtime_hours := ROUND(v_overtime_hours, 2);
    regular_pay := v_regular_pay;
    overtime_pay := v_overtime_pay;
    total_pay := v_total_pay;
    currency := v_worker.currency;

    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;
