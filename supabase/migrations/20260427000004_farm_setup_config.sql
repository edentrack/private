-- Farm setup config: stores egg prices, payout info, and other AI-configured settings
CREATE TABLE IF NOT EXISTS farm_setup_config (
  farm_id UUID PRIMARY KEY REFERENCES farms(id) ON DELETE CASCADE,
  egg_prices JSONB DEFAULT '{}',
  payout_account TEXT,
  default_pay_day INTEGER DEFAULT 30,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE farm_setup_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm_members_read_setup_config"
  ON farm_setup_config FOR SELECT
  TO authenticated
  USING (farm_id IN (
    SELECT farm_id FROM farm_members
    WHERE user_id = auth.uid() AND is_active = true
  ));

CREATE POLICY "farm_owners_managers_write_setup_config"
  ON farm_setup_config FOR ALL
  TO authenticated
  USING (farm_id IN (
    SELECT farm_id FROM farm_members
    WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'manager')
  ))
  WITH CHECK (farm_id IN (
    SELECT farm_id FROM farm_members
    WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'manager')
  ));
