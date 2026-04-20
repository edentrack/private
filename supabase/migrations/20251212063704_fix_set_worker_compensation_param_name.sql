/*
  # Fix set_worker_compensation parameter name

  The frontend passes p_user_id but the function expects p_worker_id.
  This migration fixes the parameter name to match the frontend.
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

  INSERT INTO worker_pay_rates (
    farm_id,
    worker_id,
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
END;
$$;
