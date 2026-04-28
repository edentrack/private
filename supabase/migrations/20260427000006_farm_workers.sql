-- Offline/local workers — farm hands who don't need an app account
-- Used for payroll tracking, distinct from team_members (which requires auth)
CREATE TABLE IF NOT EXISTS farm_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'worker' CHECK (role IN ('owner', 'manager', 'worker', 'supervisor')),
  monthly_salary NUMERIC(12,2),
  hourly_rate NUMERIC(12,2),
  pay_type TEXT DEFAULT 'salary' CHECK (pay_type IN ('salary', 'hourly', 'daily')),
  currency TEXT DEFAULT 'XAF',
  phone TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE farm_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm_members_read_workers"
  ON farm_workers FOR SELECT
  TO authenticated
  USING (farm_id IN (
    SELECT farm_id FROM farm_members WHERE user_id = auth.uid() AND is_active = true
  ));

CREATE POLICY "farm_owners_managers_write_workers"
  ON farm_workers FOR ALL
  TO authenticated
  USING (farm_id IN (
    SELECT farm_id FROM farm_members WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'manager')
  ))
  WITH CHECK (farm_id IN (
    SELECT farm_id FROM farm_members WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'manager')
  ));
