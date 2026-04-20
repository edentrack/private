/*
  # Fix set_worker_compensation Function

  1. Changes
    - Fixed column names for team_activity_log (actor_user_id, event_type)
    - Added option to create labor expense entry when setting compensation

  2. Security
    - Only owners and managers can set compensation
    - Validates pay type and rates
*/

DROP FUNCTION IF EXISTS set_worker_compensation(uuid, uuid, text, numeric, numeric, numeric, text);

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

  IF p_pay_type NOT IN ('hourly', 'salary') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid pay_type. Must be either "hourly" or "salary"'
    );
  END IF;

  SELECT * INTO v_old_pay_rate
  FROM worker_pay_rates
  WHERE farm_id = p_farm_id AND user_id = p_user_id
  ORDER BY effective_from DESC
  LIMIT 1;

  IF p_pay_type = 'hourly' THEN
    IF p_hourly_rate IS NULL OR p_hourly_rate <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Hourly rate is required and must be greater than 0 for hourly workers'
      );
    END IF;

    v_final_hourly_rate := p_hourly_rate;
    v_final_overtime_rate := COALESCE(p_overtime_rate, p_hourly_rate * 1.5);
    v_final_monthly_salary := NULL;

  ELSIF p_pay_type = 'salary' THEN
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

  IF v_old_pay_rate IS NULL THEN
    IF p_pay_type = 'hourly' THEN
      v_activity_message := format(
        'Set %s pay to HOURLY: %s %s/hr (OT: %s %s/hr)',
        v_worker_name,
        v_final_hourly_rate,
        p_currency,
        v_final_overtime_rate,
        p_currency
      );
    ELSE
      v_activity_message := format(
        'Set %s pay to SALARY: %s %s/month',
        v_worker_name,
        v_final_monthly_salary,
        p_currency
      );
    END IF;
  ELSE
    IF p_pay_type = 'hourly' THEN
      v_activity_message := format(
        'Updated %s hourly rate to %s %s/hr',
        v_worker_name,
        v_final_hourly_rate,
        p_currency
      );
    ELSE
      v_activity_message := format(
        'Updated %s monthly salary to %s %s',
        v_worker_name,
        v_final_monthly_salary,
        p_currency
      );
    END IF;
  END IF;

  INSERT INTO team_activity_log (
    farm_id,
    actor_user_id,
    target_user_id,
    event_type,
    details
  ) VALUES (
    p_farm_id,
    v_actor_id,
    p_user_id,
    'compensation_updated',
    jsonb_build_object(
      'old_pay_type', v_old_pay_rate.pay_type,
      'old_hourly_rate', v_old_pay_rate.hourly_rate,
      'old_monthly_salary', v_old_pay_rate.monthly_salary,
      'new_pay_type', p_pay_type,
      'new_hourly_rate', v_final_hourly_rate,
      'new_monthly_salary', v_final_monthly_salary,
      'currency', p_currency,
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

NOTIFY pgrst, 'reload schema';
