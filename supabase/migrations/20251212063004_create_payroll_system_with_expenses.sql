/*
  # Create Comprehensive Payroll System

  1. New Tables
    - `payroll_settings` - Farm-level settings for pay frequency
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `hourly_pay_frequency` (text) - weekly, bi_weekly, or monthly
      - `hourly_pay_day` (integer) - day of week (0=Sun) or day of month
      - `salary_auto_process` (boolean) - auto-process salaries on last day
      - `created_at`, `updated_at`
    
    - `payroll_records` - History of processed payrolls
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `user_id` (uuid, worker who was paid)
      - `pay_period_start` (date)
      - `pay_period_end` (date)
      - `pay_type` (text) - hourly or salary
      - `regular_hours`, `overtime_hours`
      - `regular_pay`, `overtime_pay`, `total_pay`
      - `currency` (text)
      - `expense_id` (uuid) - link to expenses table
      - `processed_by` (uuid) - who processed this
      - `processed_at` (timestamptz)
      - `status` (text) - pending, paid, cancelled
      - `notes` (text)

  2. Functions
    - `process_payroll` - Calculate and create expense entries
    - `get_pending_salary_notifications` - Get workers with salary due

  3. Security
    - RLS enabled on all tables
    - Only owners/managers can process payroll
*/

-- Payroll settings table
CREATE TABLE IF NOT EXISTS payroll_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  hourly_pay_frequency text NOT NULL DEFAULT 'monthly' CHECK (hourly_pay_frequency IN ('weekly', 'bi_weekly', 'monthly')),
  hourly_pay_day integer DEFAULT 1,
  salary_auto_process boolean DEFAULT true,
  salary_reminder_days integer DEFAULT 3,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(farm_id)
);

ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payroll_settings' AND policyname = 'Farm members can view payroll settings') THEN
    CREATE POLICY "Farm members can view payroll settings"
      ON payroll_settings FOR SELECT
      TO authenticated
      USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid() AND is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payroll_settings' AND policyname = 'Owners and managers can manage payroll settings') THEN
    CREATE POLICY "Owners and managers can manage payroll settings"
      ON payroll_settings FOR ALL
      TO authenticated
      USING (farm_id IN (
        SELECT farm_id FROM farm_members 
        WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'manager')
      ))
      WITH CHECK (farm_id IN (
        SELECT farm_id FROM farm_members 
        WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'manager')
      ));
  END IF;
END $$;

-- Payroll records table
CREATE TABLE IF NOT EXISTS payroll_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  worker_name text NOT NULL,
  pay_period_start date NOT NULL,
  pay_period_end date NOT NULL,
  pay_type text NOT NULL CHECK (pay_type IN ('hourly', 'salary')),
  regular_hours numeric DEFAULT 0,
  overtime_hours numeric DEFAULT 0,
  hourly_rate numeric,
  overtime_rate numeric,
  monthly_salary numeric,
  regular_pay numeric NOT NULL DEFAULT 0,
  overtime_pay numeric NOT NULL DEFAULT 0,
  total_pay numeric NOT NULL,
  currency text NOT NULL DEFAULT 'XAF',
  expense_id uuid REFERENCES expenses(id),
  processed_by uuid REFERENCES auth.users(id),
  processed_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'cancelled')),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payroll_records' AND policyname = 'Farm members can view payroll records') THEN
    CREATE POLICY "Farm members can view payroll records"
      ON payroll_records FOR SELECT
      TO authenticated
      USING (farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid() AND is_active = true));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payroll_records' AND policyname = 'Owners and managers can insert payroll records') THEN
    CREATE POLICY "Owners and managers can insert payroll records"
      ON payroll_records FOR INSERT
      TO authenticated
      WITH CHECK (farm_id IN (
        SELECT farm_id FROM farm_members 
        WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'manager')
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payroll_records' AND policyname = 'Owners and managers can update payroll records') THEN
    CREATE POLICY "Owners and managers can update payroll records"
      ON payroll_records FOR UPDATE
      TO authenticated
      USING (farm_id IN (
        SELECT farm_id FROM farm_members 
        WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'manager')
      ))
      WITH CHECK (farm_id IN (
        SELECT farm_id FROM farm_members 
        WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'manager')
      ));
  END IF;
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_payroll_records_farm_period 
  ON payroll_records(farm_id, pay_period_start, pay_period_end);

CREATE INDEX IF NOT EXISTS idx_payroll_records_user 
  ON payroll_records(user_id, pay_period_start);

-- Function to process payroll and create expense
CREATE OR REPLACE FUNCTION process_payroll(
  p_farm_id uuid,
  p_start_date date,
  p_end_date date,
  p_worker_ids uuid[] DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_payroll_data jsonb;
  v_worker record;
  v_expense_id uuid;
  v_payroll_id uuid;
  v_total_processed integer := 0;
  v_total_amount numeric := 0;
  v_currency text := 'XAF';
  v_processed_records jsonb := '[]'::jsonb;
BEGIN
  SELECT role INTO v_actor_role
  FROM farm_members
  WHERE farm_id = p_farm_id AND user_id = v_actor_id AND is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only farm owners and managers can process payroll'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM payroll_records
    WHERE farm_id = p_farm_id
      AND pay_period_start = p_start_date
      AND pay_period_end = p_end_date
      AND status = 'paid'
      AND (p_worker_ids IS NULL OR user_id = ANY(p_worker_ids))
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Payroll already processed for some workers in this period. Check payroll history.'
    );
  END IF;

  FOR v_worker IN
    SELECT 
      pr.worker_id,
      pr.worker_name,
      pr.worker_email,
      pr.pay_type,
      pr.regular_hours,
      pr.overtime_hours,
      pr.regular_pay,
      pr.overtime_pay,
      pr.total_pay,
      pr.currency,
      wpr.hourly_rate,
      wpr.overtime_rate,
      wpr.monthly_salary
    FROM calculate_payroll(p_farm_id, p_start_date, p_end_date) pr
    LEFT JOIN LATERAL (
      SELECT hourly_rate, overtime_rate, monthly_salary
      FROM worker_pay_rates
      WHERE farm_id = p_farm_id AND user_id = pr.worker_id
      ORDER BY effective_from DESC
      LIMIT 1
    ) wpr ON true
    WHERE p_worker_ids IS NULL OR pr.worker_id = ANY(p_worker_ids)
  LOOP
    IF v_worker.total_pay > 0 THEN
      INSERT INTO expenses (
        farm_id,
        category,
        description,
        amount,
        currency,
        incurred_on,
        date,
        kind,
        notes,
        user_id
      ) VALUES (
        p_farm_id,
        'labor',
        format('Payroll: %s (%s - %s)', v_worker.worker_name, p_start_date, p_end_date),
        v_worker.total_pay,
        v_worker.currency,
        CURRENT_DATE,
        CURRENT_DATE,
        'labor_payroll',
        COALESCE(p_notes, '') || CASE 
          WHEN v_worker.pay_type = 'hourly' THEN 
            format(' | Hours: %s regular, %s OT', v_worker.regular_hours, v_worker.overtime_hours)
          ELSE 
            ' | Monthly salary'
        END,
        v_actor_id
      )
      RETURNING id INTO v_expense_id;

      INSERT INTO payroll_records (
        farm_id,
        user_id,
        worker_name,
        pay_period_start,
        pay_period_end,
        pay_type,
        regular_hours,
        overtime_hours,
        hourly_rate,
        overtime_rate,
        monthly_salary,
        regular_pay,
        overtime_pay,
        total_pay,
        currency,
        expense_id,
        processed_by,
        status,
        notes
      ) VALUES (
        p_farm_id,
        v_worker.worker_id,
        v_worker.worker_name,
        p_start_date,
        p_end_date,
        v_worker.pay_type,
        v_worker.regular_hours,
        v_worker.overtime_hours,
        v_worker.hourly_rate,
        v_worker.overtime_rate,
        v_worker.monthly_salary,
        v_worker.regular_pay,
        v_worker.overtime_pay,
        v_worker.total_pay,
        v_worker.currency,
        v_expense_id,
        v_actor_id,
        'paid',
        p_notes
      )
      RETURNING id INTO v_payroll_id;

      v_total_processed := v_total_processed + 1;
      v_total_amount := v_total_amount + v_worker.total_pay;
      v_currency := v_worker.currency;

      v_processed_records := v_processed_records || jsonb_build_object(
        'payroll_id', v_payroll_id,
        'expense_id', v_expense_id,
        'worker_name', v_worker.worker_name,
        'total_pay', v_worker.total_pay
      );
    END IF;
  END LOOP;

  IF v_total_processed = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No payroll to process. Workers may not have compensation rates set or no hours logged.'
    );
  END IF;

  INSERT INTO team_activity_log (
    farm_id,
    actor_user_id,
    event_type,
    details
  ) VALUES (
    p_farm_id,
    v_actor_id,
    'payroll_processed',
    jsonb_build_object(
      'period_start', p_start_date,
      'period_end', p_end_date,
      'workers_paid', v_total_processed,
      'total_amount', v_total_amount,
      'currency', v_currency
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Payroll processed for %s workers. Total: %s %s', v_total_processed, v_total_amount, v_currency),
    'workers_paid', v_total_processed,
    'total_amount', v_total_amount,
    'currency', v_currency,
    'records', v_processed_records
  );
END;
$$;

-- Function to get pending salary notifications
CREATE OR REPLACE FUNCTION get_salary_due_notifications(p_farm_id uuid)
RETURNS TABLE (
  user_id uuid,
  worker_name text,
  monthly_salary numeric,
  currency text,
  days_until_due integer,
  last_paid_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_day_of_month date;
  v_reminder_days integer;
BEGIN
  v_last_day_of_month := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;

  SELECT COALESCE(ps.salary_reminder_days, 3) INTO v_reminder_days
  FROM payroll_settings ps
  WHERE ps.farm_id = p_farm_id;

  IF v_reminder_days IS NULL THEN
    v_reminder_days := 3;
  END IF;

  RETURN QUERY
  SELECT 
    fm.user_id,
    p.full_name as worker_name,
    wpr.monthly_salary,
    wpr.currency,
    (v_last_day_of_month - CURRENT_DATE)::integer as days_until_due,
    (
      SELECT MAX(pr.pay_period_end)
      FROM payroll_records pr
      WHERE pr.user_id = fm.user_id 
        AND pr.farm_id = p_farm_id 
        AND pr.status = 'paid'
        AND pr.pay_type = 'salary'
    ) as last_paid_date
  FROM farm_members fm
  JOIN profiles p ON p.id = fm.user_id
  JOIN LATERAL (
    SELECT wpr2.monthly_salary, wpr2.currency, wpr2.pay_type
    FROM worker_pay_rates wpr2
    WHERE wpr2.farm_id = p_farm_id AND wpr2.user_id = fm.user_id
    ORDER BY wpr2.effective_from DESC
    LIMIT 1
  ) wpr ON true
  WHERE fm.farm_id = p_farm_id
    AND fm.is_active = true
    AND wpr.pay_type = 'salary'
    AND wpr.monthly_salary > 0
    AND (v_last_day_of_month - CURRENT_DATE) <= v_reminder_days
    AND NOT EXISTS (
      SELECT 1 FROM payroll_records pr
      WHERE pr.user_id = fm.user_id
        AND pr.farm_id = p_farm_id
        AND pr.pay_period_end >= date_trunc('month', CURRENT_DATE)::date
        AND pr.status = 'paid'
        AND pr.pay_type = 'salary'
    );
END;
$$;

-- Function to save payroll settings
CREATE OR REPLACE FUNCTION save_payroll_settings(
  p_farm_id uuid,
  p_hourly_pay_frequency text,
  p_hourly_pay_day integer,
  p_salary_auto_process boolean,
  p_salary_reminder_days integer
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
    RETURN jsonb_build_object('success', false, 'error', 'Only owners and managers can change payroll settings');
  END IF;

  INSERT INTO payroll_settings (
    farm_id,
    hourly_pay_frequency,
    hourly_pay_day,
    salary_auto_process,
    salary_reminder_days
  ) VALUES (
    p_farm_id,
    p_hourly_pay_frequency,
    p_hourly_pay_day,
    p_salary_auto_process,
    p_salary_reminder_days
  )
  ON CONFLICT (farm_id) DO UPDATE SET
    hourly_pay_frequency = EXCLUDED.hourly_pay_frequency,
    hourly_pay_day = EXCLUDED.hourly_pay_day,
    salary_auto_process = EXCLUDED.salary_auto_process,
    salary_reminder_days = EXCLUDED.salary_reminder_days,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'message', 'Payroll settings saved');
END;
$$;

NOTIFY pgrst, 'reload schema';
