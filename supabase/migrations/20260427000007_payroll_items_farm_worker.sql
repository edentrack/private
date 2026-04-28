-- Allow payroll items for offline farm workers (no auth account)
-- worker_id (auth.users FK) stays for real team members, farm_worker_id for offline workers

ALTER TABLE payroll_items ALTER COLUMN worker_id DROP NOT NULL;

ALTER TABLE payroll_items
  ADD COLUMN IF NOT EXISTS farm_worker_id UUID REFERENCES farm_workers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_items_farm_worker ON payroll_items(farm_worker_id);
