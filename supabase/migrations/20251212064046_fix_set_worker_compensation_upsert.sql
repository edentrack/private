/*
  # Fix set_worker_compensation to update existing records

  1. Changes
    - Use worker_id consistently (same as user_id in this context)
    - Update existing record if one exists for this worker/farm
    - Only insert new record if none exists
*/

DROP FUNCTION IF EXISTS set_worker_compensation(uuid, uuid, text, numeric, numeric, numeric, text);

CREATE FUNCTION set_worker_compensation(
  p_farm_id uuid,
  p_user_id uuid,
  p_pay_type text,
  p_hourly_rate numeric DEFAULT 0,
  p_overtime_rate numeric DEFAULT 0,
  p_monthly_salary numeric DEFAULT 0,
  p_currency text DEFAULT 'XAF'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_rate_amount numeric;
  v_existing_id uuid;
BEGIN
  SELECT role INTO v_actor_role
  FROM farm_members
  WHERE farm_id = p_farm_id AND user_id = auth.uid() AND is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners and managers can set compensation');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = p_farm_id AND user_id = p_user_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker not found in this farm');
  END IF;

  IF p_pay_type = 'hourly' THEN
    v_rate_amount := COALESCE(p_hourly_rate, 0);
  ELSE
    v_rate_amount := COALESCE(p_monthly_salary, 0);
  END IF;

  SELECT id INTO v_existing_id
  FROM worker_pay_rates
  WHERE farm_id = p_farm_id AND worker_id = p_user_id
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE worker_pay_rates
    SET
      rate_type = p_pay_type,
      rate_amount = v_rate_amount,
      pay_type = p_pay_type,
      hourly_rate = COALESCE(p_hourly_rate, 0),
      overtime_rate = COALESCE(p_overtime_rate, 0),
      monthly_salary = COALESCE(p_monthly_salary, 0),
      currency = p_currency
    WHERE id = v_existing_id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Compensation updated successfully'
    );
  ELSE
    INSERT INTO worker_pay_rates (
      farm_id,
      worker_id,
      user_id,
      rate_type,
      rate_amount,
      pay_type,
      hourly_rate,
      overtime_rate,
      monthly_salary,
      currency,
      effective_from,
      created_by
    ) VALUES (
      p_farm_id,
      p_user_id,
      p_user_id,
      p_pay_type,
      v_rate_amount,
      p_pay_type,
      COALESCE(p_hourly_rate, 0),
      COALESCE(p_overtime_rate, 0),
      COALESCE(p_monthly_salary, 0),
      p_currency,
      CURRENT_DATE,
      auth.uid()
    );

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Compensation set successfully'
    );
  END IF;
END;
$$;
