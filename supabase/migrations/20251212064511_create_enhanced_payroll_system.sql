/*
  # Enhanced Payroll System

  1. New Tables
    - `payroll_runs` - Track payroll processing batches with approval workflow
    - `payroll_items` - Individual pay entries within a payroll run
    - `payroll_adjustments` - Bonuses and deductions
    - `pay_stubs` - Generated pay stubs for workers

  2. Security
    - Enable RLS on all new tables
    - Uses existing helper functions for authorization

  3. Functions
    - create_payroll_run - Creates a new payroll batch
    - process_payroll_run - Approves and processes payroll
    - get_payroll_stats - Returns payroll analytics
*/

-- Payroll Runs Table
CREATE TABLE IF NOT EXISTS payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  pay_period_start date NOT NULL,
  pay_period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'processing', 'completed', 'cancelled')),
  total_amount numeric DEFAULT 0,
  total_workers integer DEFAULT 0,
  currency text DEFAULT 'XAF',
  created_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  processed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payroll runs for their farms"
  ON payroll_runs FOR SELECT
  TO authenticated
  USING (user_has_farm_access(farm_id));

CREATE POLICY "Owners and managers can create payroll runs"
  ON payroll_runs FOR INSERT
  TO authenticated
  WITH CHECK (user_is_farm_admin(farm_id));

CREATE POLICY "Owners and managers can update payroll runs"
  ON payroll_runs FOR UPDATE
  TO authenticated
  USING (user_is_farm_admin(farm_id))
  WITH CHECK (user_is_farm_admin(farm_id));

CREATE POLICY "Owners can delete payroll runs"
  ON payroll_runs FOR DELETE
  TO authenticated
  USING (user_is_farm_owner(farm_id));

-- Payroll Items Table
CREATE TABLE IF NOT EXISTS payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES auth.users(id),
  worker_name text NOT NULL,
  worker_email text,
  pay_type text NOT NULL CHECK (pay_type IN ('hourly', 'salary')),
  hourly_rate numeric DEFAULT 0,
  base_pay numeric DEFAULT 0,
  overtime_pay numeric DEFAULT 0,
  bonus_amount numeric DEFAULT 0,
  deduction_amount numeric DEFAULT 0,
  net_pay numeric DEFAULT 0,
  regular_hours numeric DEFAULT 0,
  overtime_hours numeric DEFAULT 0,
  currency text DEFAULT 'XAF',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'on_hold')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payroll items"
  ON payroll_items FOR SELECT
  TO authenticated
  USING (worker_id = auth.uid() OR user_is_farm_admin(farm_id));

CREATE POLICY "Owners and managers can create payroll items"
  ON payroll_items FOR INSERT
  TO authenticated
  WITH CHECK (user_is_farm_admin(farm_id));

CREATE POLICY "Owners and managers can update payroll items"
  ON payroll_items FOR UPDATE
  TO authenticated
  USING (user_is_farm_admin(farm_id))
  WITH CHECK (user_is_farm_admin(farm_id));

-- Payroll Adjustments Table
CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES auth.users(id),
  payroll_item_id uuid REFERENCES payroll_items(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('bonus', 'deduction')),
  category text NOT NULL CHECK (category IN ('performance_bonus', 'attendance_bonus', 'overtime_bonus', 'advance', 'loan_repayment', 'absence', 'damage', 'tax', 'housing', 'transport', 'meal', 'other')),
  amount numeric NOT NULL,
  description text,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  recurring boolean DEFAULT false,
  recurring_frequency text CHECK (recurring_frequency IN ('weekly', 'bi_weekly', 'monthly', 'per_payroll')),
  end_date date,
  is_applied boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own adjustments"
  ON payroll_adjustments FOR SELECT
  TO authenticated
  USING (worker_id = auth.uid() OR user_is_farm_admin(farm_id));

CREATE POLICY "Owners and managers can create adjustments"
  ON payroll_adjustments FOR INSERT
  TO authenticated
  WITH CHECK (user_is_farm_admin(farm_id));

CREATE POLICY "Owners and managers can update adjustments"
  ON payroll_adjustments FOR UPDATE
  TO authenticated
  USING (user_is_farm_admin(farm_id))
  WITH CHECK (user_is_farm_admin(farm_id));

CREATE POLICY "Owners and managers can delete adjustments"
  ON payroll_adjustments FOR DELETE
  TO authenticated
  USING (user_is_farm_admin(farm_id));

-- Pay Stubs Table
CREATE TABLE IF NOT EXISTS pay_stubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_item_id uuid REFERENCES payroll_items(id) ON DELETE SET NULL,
  payroll_run_id uuid REFERENCES payroll_runs(id) ON DELETE SET NULL,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES auth.users(id),
  stub_number text UNIQUE NOT NULL,
  pay_period_start date NOT NULL,
  pay_period_end date NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  gross_pay numeric NOT NULL DEFAULT 0,
  total_bonuses numeric DEFAULT 0,
  total_deductions numeric DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'XAF',
  breakdown jsonb DEFAULT '{}',
  viewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pay_stubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can view their own pay stubs"
  ON pay_stubs FOR SELECT
  TO authenticated
  USING (worker_id = auth.uid() OR user_is_farm_admin(farm_id));

CREATE POLICY "System can create pay stubs"
  ON pay_stubs FOR INSERT
  TO authenticated
  WITH CHECK (user_is_farm_admin(farm_id));

-- Function to generate unique stub number
CREATE OR REPLACE FUNCTION generate_stub_number(p_farm_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
  v_year text;
  v_stub_number text;
BEGIN
  v_year := to_char(CURRENT_DATE, 'YYYY');
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM pay_stubs
  WHERE farm_id = p_farm_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE);
  
  v_stub_number := 'PS-' || v_year || '-' || LPAD(v_count::text, 5, '0');
  
  RETURN v_stub_number;
END;
$$;

-- Function to create a payroll run with items
CREATE OR REPLACE FUNCTION create_payroll_run(
  p_farm_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_run_id uuid;
  v_worker record;
  v_pay_rate record;
  v_regular_hours numeric;
  v_overtime_hours numeric;
  v_base_pay numeric;
  v_overtime_pay numeric;
  v_bonus_total numeric;
  v_deduction_total numeric;
  v_net_pay numeric;
  v_total_amount numeric := 0;
  v_total_workers integer := 0;
  v_currency text := 'XAF';
  v_days_in_period integer;
  v_days_in_month integer;
BEGIN
  SELECT role INTO v_actor_role
  FROM farm_members
  WHERE farm_id = p_farm_id AND user_id = auth.uid() AND is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners and managers can create payroll runs');
  END IF;

  IF EXISTS (
    SELECT 1 FROM payroll_runs
    WHERE farm_id = p_farm_id
      AND status NOT IN ('cancelled', 'completed')
      AND pay_period_start <= p_end_date AND pay_period_end >= p_start_date
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A payroll run already exists for this period');
  END IF;

  INSERT INTO payroll_runs (farm_id, pay_period_start, pay_period_end, status, created_by)
  VALUES (p_farm_id, p_start_date, p_end_date, 'draft', auth.uid())
  RETURNING id INTO v_run_id;

  v_days_in_period := p_end_date - p_start_date + 1;
  v_days_in_month := DATE_PART('day', DATE_TRUNC('month', p_start_date) + INTERVAL '1 month' - INTERVAL '1 day');

  FOR v_worker IN
    SELECT 
      fm.user_id,
      p.full_name,
      p.email
    FROM farm_members fm
    JOIN profiles p ON p.id = fm.user_id
    WHERE fm.farm_id = p_farm_id
      AND fm.is_active = true
      AND fm.role IN ('worker', 'manager')
  LOOP
    SELECT * INTO v_pay_rate
    FROM worker_pay_rates
    WHERE farm_id = p_farm_id AND worker_id = v_worker.user_id
    ORDER BY effective_from DESC
    LIMIT 1;

    IF v_pay_rate IS NULL THEN
      CONTINUE;
    END IF;

    v_currency := COALESCE(v_pay_rate.currency, 'XAF');
    v_regular_hours := 0;
    v_overtime_hours := 0;
    v_base_pay := 0;
    v_overtime_pay := 0;

    IF v_pay_rate.pay_type = 'hourly' THEN
      SELECT 
        COALESCE(SUM(
          CASE 
            WHEN EXTRACT(EPOCH FROM (end_time - start_time))/3600 <= 8 
            THEN EXTRACT(EPOCH FROM (end_time - start_time))/3600
            ELSE 8
          END
        ), 0),
        COALESCE(SUM(
          CASE 
            WHEN EXTRACT(EPOCH FROM (end_time - start_time))/3600 > 8 
            THEN EXTRACT(EPOCH FROM (end_time - start_time))/3600 - 8
            ELSE 0
          END
        ), 0)
      INTO v_regular_hours, v_overtime_hours
      FROM worker_shifts
      WHERE farm_id = p_farm_id
        AND worker_id = v_worker.user_id
        AND status = 'completed'
        AND start_time::date >= p_start_date
        AND end_time::date <= p_end_date;

      v_base_pay := v_regular_hours * COALESCE(v_pay_rate.hourly_rate, 0);
      v_overtime_pay := v_overtime_hours * COALESCE(v_pay_rate.overtime_rate, v_pay_rate.hourly_rate * 1.5);
    ELSE
      v_base_pay := (COALESCE(v_pay_rate.monthly_salary, 0) / v_days_in_month) * v_days_in_period;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_bonus_total
    FROM payroll_adjustments
    WHERE farm_id = p_farm_id
      AND worker_id = v_worker.user_id
      AND type = 'bonus'
      AND is_applied = false
      AND effective_date <= p_end_date;

    SELECT COALESCE(SUM(amount), 0) INTO v_deduction_total
    FROM payroll_adjustments
    WHERE farm_id = p_farm_id
      AND worker_id = v_worker.user_id
      AND type = 'deduction'
      AND is_applied = false
      AND effective_date <= p_end_date;

    v_net_pay := v_base_pay + v_overtime_pay + v_bonus_total - v_deduction_total;

    INSERT INTO payroll_items (
      payroll_run_id, farm_id, worker_id, worker_name, worker_email,
      pay_type, hourly_rate, base_pay, overtime_pay, bonus_amount,
      deduction_amount, net_pay, regular_hours, overtime_hours, currency
    ) VALUES (
      v_run_id, p_farm_id, v_worker.user_id, v_worker.full_name, v_worker.email,
      v_pay_rate.pay_type, COALESCE(v_pay_rate.hourly_rate, 0), v_base_pay, v_overtime_pay,
      v_bonus_total, v_deduction_total, v_net_pay, v_regular_hours, v_overtime_hours, v_currency
    );

    v_total_amount := v_total_amount + v_net_pay;
    v_total_workers := v_total_workers + 1;
  END LOOP;

  UPDATE payroll_runs
  SET total_amount = v_total_amount,
      total_workers = v_total_workers,
      currency = v_currency
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'payroll_run_id', v_run_id,
    'total_amount', v_total_amount,
    'total_workers', v_total_workers,
    'message', 'Payroll run created with ' || v_total_workers || ' workers'
  );
END;
$$;

-- Function to approve and process payroll run
CREATE OR REPLACE FUNCTION process_payroll_run(p_payroll_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run record;
  v_actor_role text;
  v_item record;
  v_stub_number text;
  v_breakdown jsonb;
  v_bonuses_breakdown jsonb;
  v_deductions_breakdown jsonb;
BEGIN
  SELECT * INTO v_run FROM payroll_runs WHERE id = p_payroll_run_id;
  
  IF v_run IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payroll run not found');
  END IF;

  SELECT role INTO v_actor_role
  FROM farm_members
  WHERE farm_id = v_run.farm_id AND user_id = auth.uid() AND is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners and managers can process payroll');
  END IF;

  IF v_run.status NOT IN ('draft', 'pending_approval', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payroll run cannot be processed in current status');
  END IF;

  UPDATE payroll_runs
  SET status = 'processing', approved_by = auth.uid(), approved_at = now()
  WHERE id = p_payroll_run_id;

  FOR v_item IN SELECT * FROM payroll_items WHERE payroll_run_id = p_payroll_run_id LOOP
    SELECT jsonb_agg(jsonb_build_object('category', category, 'amount', amount, 'description', description))
    INTO v_bonuses_breakdown
    FROM payroll_adjustments
    WHERE farm_id = v_run.farm_id AND worker_id = v_item.worker_id
      AND type = 'bonus' AND is_applied = false AND effective_date <= v_run.pay_period_end;

    SELECT jsonb_agg(jsonb_build_object('category', category, 'amount', amount, 'description', description))
    INTO v_deductions_breakdown
    FROM payroll_adjustments
    WHERE farm_id = v_run.farm_id AND worker_id = v_item.worker_id
      AND type = 'deduction' AND is_applied = false AND effective_date <= v_run.pay_period_end;

    v_breakdown := jsonb_build_object(
      'base_pay', v_item.base_pay,
      'overtime_pay', v_item.overtime_pay,
      'regular_hours', v_item.regular_hours,
      'overtime_hours', v_item.overtime_hours,
      'hourly_rate', v_item.hourly_rate,
      'pay_type', v_item.pay_type,
      'bonuses', COALESCE(v_bonuses_breakdown, '[]'::jsonb),
      'deductions', COALESCE(v_deductions_breakdown, '[]'::jsonb)
    );

    v_stub_number := generate_stub_number(v_run.farm_id);

    INSERT INTO pay_stubs (
      payroll_item_id, payroll_run_id, farm_id, worker_id, stub_number,
      pay_period_start, pay_period_end, payment_date,
      gross_pay, total_bonuses, total_deductions, net_pay, currency, breakdown
    ) VALUES (
      v_item.id, p_payroll_run_id, v_run.farm_id, v_item.worker_id, v_stub_number,
      v_run.pay_period_start, v_run.pay_period_end, CURRENT_DATE,
      v_item.base_pay + v_item.overtime_pay, v_item.bonus_amount, v_item.deduction_amount,
      v_item.net_pay, v_item.currency, v_breakdown
    );

    UPDATE payroll_adjustments
    SET is_applied = true, payroll_item_id = v_item.id
    WHERE farm_id = v_run.farm_id AND worker_id = v_item.worker_id
      AND is_applied = false AND effective_date <= v_run.pay_period_end AND recurring = false;

    UPDATE payroll_items SET status = 'paid' WHERE id = v_item.id;

    INSERT INTO expenses (farm_id, category, amount, description, expense_date, kind)
    VALUES (
      v_run.farm_id, 'labor', v_item.net_pay,
      'Payroll: ' || v_item.worker_name || ' (' || v_run.pay_period_start || ' to ' || v_run.pay_period_end || ')',
      CURRENT_DATE, 'operational'
    );
  END LOOP;

  UPDATE payroll_runs SET status = 'completed', processed_at = now() WHERE id = p_payroll_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payroll processed successfully. ' || v_run.total_workers || ' workers paid.',
    'total_amount', v_run.total_amount
  );
END;
$$;

-- Function to get payroll summary stats
CREATE OR REPLACE FUNCTION get_payroll_stats(p_farm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_this_month_total numeric;
  v_last_month_total numeric;
  v_ytd_total numeric;
  v_pending_adjustments integer;
  v_active_workers integer;
  v_avg_pay numeric;
BEGIN
  SELECT COALESCE(SUM(total_amount), 0) INTO v_this_month_total
  FROM payroll_runs WHERE farm_id = p_farm_id AND status = 'completed'
    AND EXTRACT(MONTH FROM processed_at) = EXTRACT(MONTH FROM CURRENT_DATE)
    AND EXTRACT(YEAR FROM processed_at) = EXTRACT(YEAR FROM CURRENT_DATE);

  SELECT COALESCE(SUM(total_amount), 0) INTO v_last_month_total
  FROM payroll_runs WHERE farm_id = p_farm_id AND status = 'completed'
    AND EXTRACT(MONTH FROM processed_at) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month')
    AND EXTRACT(YEAR FROM processed_at) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month');

  SELECT COALESCE(SUM(total_amount), 0) INTO v_ytd_total
  FROM payroll_runs WHERE farm_id = p_farm_id AND status = 'completed'
    AND EXTRACT(YEAR FROM processed_at) = EXTRACT(YEAR FROM CURRENT_DATE);

  SELECT COUNT(*) INTO v_pending_adjustments
  FROM payroll_adjustments WHERE farm_id = p_farm_id AND is_applied = false;

  SELECT COUNT(DISTINCT worker_id) INTO v_active_workers
  FROM worker_pay_rates WHERE farm_id = p_farm_id;

  SELECT COALESCE(AVG(net_pay), 0) INTO v_avg_pay
  FROM payroll_items pi JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
  WHERE pr.farm_id = p_farm_id AND pr.status = 'completed';

  RETURN jsonb_build_object(
    'this_month_total', v_this_month_total,
    'last_month_total', v_last_month_total,
    'ytd_total', v_ytd_total,
    'pending_adjustments', v_pending_adjustments,
    'active_workers', v_active_workers,
    'average_pay', v_avg_pay,
    'month_over_month_change', CASE 
      WHEN v_last_month_total > 0 
      THEN ROUND(((v_this_month_total - v_last_month_total) / v_last_month_total * 100)::numeric, 1)
      ELSE 0 
    END
  );
END;
$$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payroll_runs_farm_status ON payroll_runs(farm_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_items_run ON payroll_items(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_worker ON payroll_items(worker_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_farm_worker ON payroll_adjustments(farm_id, worker_id);
CREATE INDEX IF NOT EXISTS idx_pay_stubs_worker ON pay_stubs(worker_id);
CREATE INDEX IF NOT EXISTS idx_pay_stubs_farm ON pay_stubs(farm_id);
