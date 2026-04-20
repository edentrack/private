/*
  # Create Set Worker Compensation RPC

  1. New Functions
    - `set_worker_compensation` - Sets or updates worker compensation with audit logging
    - `get_active_worker_pay_rate` - Helper to get the current active pay rate for a worker

  2. Behavior
    - Validates pay type (hourly or salary)
    - For hourly: requires hourly_rate, auto-calculates overtime_rate if not provided
    - For salary: requires monthly_salary, nullifies hourly rates
    - Inserts new record with effective_from = now()
    - Logs change to team_activity_log for audit trail
    - Only owners and managers can call this function

  3. Security
    - Enforces farm membership and role checks
    - Returns success/error messages
*/

-- Helper function to get the active (most recent) pay rate for a worker
CREATE OR REPLACE FUNCTION get_active_worker_pay_rate(
  p_farm_id uuid,
  p_user_id uuid
)
RETURNS worker_pay_rates
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay_rate worker_pay_rates;
BEGIN
  SELECT * INTO v_pay_rate
  FROM worker_pay_rates
  WHERE farm_id = p_farm_id
    AND user_id = p_user_id
  ORDER BY effective_from DESC
  LIMIT 1;
  
  RETURN v_pay_rate;
END;
$$;

-- Main function to set worker compensation
CREATE OR REPLACE FUNCTION set_worker_compensation(
  p_farm_id uuid,
  p_user_id uuid,
  p_pay_type text,
  p_hourly_rate numeric DEFAULT NULL,
  p_overtime_rate numeric DEFAULT NULL,
  p_monthly_salary numeric DEFAULT NULL,
  p_currency text DEFAULT 'XAF'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_actor_name text;
  v_worker_name text;
  v_old_pay_rate worker_pay_rates;
  v_final_hourly_rate numeric;
  v_final_overtime_rate numeric;
  v_final_monthly_salary numeric;
  v_new_rate_id uuid;
  v_activity_message text;
BEGIN
  -- Check if actor is owner or manager of this farm
  SELECT fm.role, p.full_name INTO v_actor_role, v_actor_name
  FROM farm_members fm
  JOIN profiles p ON p.id = fm.user_id
  WHERE fm.farm_id = p_farm_id
    AND fm.user_id = v_actor_id
    AND fm.is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only farm owners and managers can set worker compensation'
    );
  END IF;

  -- Check if target user is a member of this farm
  SELECT p.full_name INTO v_worker_name
  FROM farm_members fm
  JOIN profiles p ON p.id = fm.user_id
  WHERE fm.farm_id = p_farm_id
    AND fm.user_id = p_user_id
    AND fm.is_active = true;

  IF v_worker_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Target user is not an active member of this farm'
    );
  END IF;

  -- Validate pay_type
  IF p_pay_type NOT IN ('hourly', 'salary') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid pay_type. Must be either "hourly" or "salary"'
    );
  END IF;

  -- Get old pay rate for audit logging
  v_old_pay_rate := get_active_worker_pay_rate(p_farm_id, p_user_id);

  -- Validate and prepare values based on pay_type
  IF p_pay_type = 'hourly' THEN
    -- Hourly worker validation
    IF p_hourly_rate IS NULL OR p_hourly_rate <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Hourly rate is required and must be greater than 0 for hourly workers'
      );
    END IF;

    v_final_hourly_rate := p_hourly_rate;
    -- Auto-calculate overtime rate if not provided (1.5x hourly rate)
    v_final_overtime_rate := COALESCE(p_overtime_rate, p_hourly_rate * 1.5);
    v_final_monthly_salary := NULL;

  ELSIF p_pay_type = 'salary' THEN
    -- Salaried worker validation
    IF p_monthly_salary IS NULL OR p_monthly_salary <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Monthly salary is required and must be greater than 0 for salaried workers'
      );
    END IF;

    v_final_hourly_rate := NULL;
    v_final_overtime_rate := NULL;
    v_final_monthly_salary := p_monthly_salary;
  END IF;

  -- Insert new pay rate record
  INSERT INTO worker_pay_rates (
    farm_id,
    user_id,
    pay_type,
    hourly_rate,
    overtime_rate,
    monthly_salary,
    currency,
    effective_from
  ) VALUES (
    p_farm_id,
    p_user_id,
    p_pay_type,
    v_final_hourly_rate,
    v_final_overtime_rate,
    v_final_monthly_salary,
    p_currency,
    now()
  )
  RETURNING id INTO v_new_rate_id;

  -- Build activity message for audit log
  IF v_old_pay_rate IS NULL THEN
    -- First time setting compensation
    IF p_pay_type = 'hourly' THEN
      v_activity_message := format(
        '%s set %s''s pay to HOURLY: %s %s/hr (OT: %s %s/hr)',
        v_actor_name,
        v_worker_name,
        v_final_hourly_rate,
        p_currency,
        v_final_overtime_rate,
        p_currency
      );
    ELSE
      v_activity_message := format(
        '%s set %s''s pay to SALARY: %s %s/month',
        v_actor_name,
        v_worker_name,
        v_final_monthly_salary,
        p_currency
      );
    END IF;
  ELSE
    -- Updating existing compensation
    IF v_old_pay_rate.pay_type = p_pay_type THEN
      -- Same pay type, just rate change
      IF p_pay_type = 'hourly' THEN
        v_activity_message := format(
          '%s changed %s''s hourly rate from %s %s to %s %s',
          v_actor_name,
          v_worker_name,
          v_old_pay_rate.hourly_rate,
          v_old_pay_rate.currency,
          v_final_hourly_rate,
          p_currency
        );
      ELSE
        v_activity_message := format(
          '%s changed %s''s monthly salary from %s %s to %s %s',
          v_actor_name,
          v_worker_name,
          v_old_pay_rate.monthly_salary,
          v_old_pay_rate.currency,
          v_final_monthly_salary,
          p_currency
        );
      END IF;
    ELSE
      -- Pay type changed
      IF p_pay_type = 'hourly' THEN
        v_activity_message := format(
          '%s changed %s from SALARY (%s %s/mo) to HOURLY (%s %s/hr)',
          v_actor_name,
          v_worker_name,
          v_old_pay_rate.monthly_salary,
          v_old_pay_rate.currency,
          v_final_hourly_rate,
          p_currency
        );
      ELSE
        v_activity_message := format(
          '%s changed %s from HOURLY (%s %s/hr) to SALARY (%s %s/mo)',
          v_actor_name,
          v_worker_name,
          v_old_pay_rate.hourly_rate,
          v_old_pay_rate.currency,
          v_final_monthly_salary,
          p_currency
        );
      END IF;
    END IF;
  END IF;

  -- Log to team activity
  INSERT INTO team_activity_log (
    farm_id,
    actor_id,
    target_user_id,
    action_type,
    details
  ) VALUES (
    p_farm_id,
    v_actor_id,
    p_user_id,
    'compensation_updated',
    jsonb_build_object(
      'old_pay_type', v_old_pay_rate.pay_type,
      'old_hourly_rate', v_old_pay_rate.hourly_rate,
      'old_overtime_rate', v_old_pay_rate.overtime_rate,
      'old_monthly_salary', v_old_pay_rate.monthly_salary,
      'old_currency', v_old_pay_rate.currency,
      'new_pay_type', p_pay_type,
      'new_hourly_rate', v_final_hourly_rate,
      'new_overtime_rate', v_final_overtime_rate,
      'new_monthly_salary', v_final_monthly_salary,
      'new_currency', p_currency,
      'message', v_activity_message
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', v_activity_message,
    'rate_id', v_new_rate_id
  );
END;
$$;
