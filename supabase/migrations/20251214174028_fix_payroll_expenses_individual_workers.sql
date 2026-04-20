/*
  # Fix Payroll to Expense Integration

  1. Changes
    - Fix process_payroll_run function to remove incorrect expense creation
    - Update payroll expense trigger to create individual worker labor expenses
    - Link each expense to the corresponding payroll_item_id for traceability

  2. Details
    - Each worker's pay becomes a separate Labor expense
    - Expenses are linked via payroll_item_id for full audit trail
    - Old trigger replaced with new logic that creates per-worker expenses
*/

-- Add payroll_item_id to expenses table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'payroll_item_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN payroll_item_id uuid REFERENCES payroll_items(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_expenses_payroll_item ON expenses(payroll_item_id) WHERE payroll_item_id IS NOT NULL;
  END IF;
END $$;

-- Drop the old trigger
DROP TRIGGER IF EXISTS trigger_payroll_labor_expense ON payroll_runs;
DROP FUNCTION IF EXISTS create_payroll_labor_expense();

-- New function to create individual worker labor expenses when payroll completes
CREATE OR REPLACE FUNCTION create_worker_labor_expenses()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if status changed to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
    -- Create a labor expense for each payroll item
    INSERT INTO expenses (
      farm_id,
      flock_id,
      category,
      description,
      amount,
      currency,
      incurred_on,
      kind,
      payroll_run_id,
      payroll_item_id,
      notes,
      created_at
    )
    SELECT
      pi.farm_id,
      NULL,
      'Labor',
      'Payroll: ' || pi.worker_name || ' (' || 
        TO_CHAR(NEW.pay_period_start, 'Mon DD') || ' - ' || 
        TO_CHAR(NEW.pay_period_end, 'Mon DD, YYYY') || ')',
      pi.net_pay,
      pi.currency,
      NEW.pay_period_end,
      'payroll_item_' || pi.id::text,
      NEW.id,
      pi.id,
      CASE 
        WHEN pi.pay_type = 'hourly' THEN 
          'Hours: ' || ROUND(pi.regular_hours, 2) || ' regular' ||
          CASE WHEN pi.overtime_hours > 0 THEN ', ' || ROUND(pi.overtime_hours, 2) || ' overtime' ELSE '' END
        ELSE 'Monthly salary'
      END || 
      CASE WHEN pi.bonus_amount > 0 THEN ' | Bonuses: ' || pi.bonus_amount::text ELSE '' END ||
      CASE WHEN pi.deduction_amount > 0 THEN ' | Deductions: ' || pi.deduction_amount::text ELSE '' END,
      COALESCE(NEW.processed_at, now())
    FROM payroll_items pi
    WHERE pi.payroll_run_id = NEW.id
      AND NOT EXISTS (
        SELECT 1 FROM expenses e WHERE e.payroll_item_id = pi.id
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on payroll_runs table
CREATE TRIGGER trigger_worker_labor_expenses
  AFTER UPDATE ON payroll_runs
  FOR EACH ROW
  EXECUTE FUNCTION create_worker_labor_expenses();

-- Fix the process_payroll_run function to remove the incorrect expense creation
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
  END LOOP;

  UPDATE payroll_runs SET status = 'completed', processed_at = now() WHERE id = p_payroll_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Payroll processed successfully. ' || v_run.total_workers || ' workers paid.',
    'total_amount', v_run.total_amount
  );
END;
$$;
