/*
  # Fix Payroll Labor Category Case Sensitivity

  1. Changes
    - Update create_worker_labor_expenses() function to use lowercase 'labor' instead of 'Labor'
    - Ensures payroll expenses match the expense_category enum format

  2. Notes
    - PostgreSQL enums are case-sensitive
    - The expense_category enum uses lowercase values: 'labor', 'feed', etc.
*/

-- Recreate function with correct enum value
CREATE OR REPLACE FUNCTION create_worker_labor_expenses()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    
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
      'labor',
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