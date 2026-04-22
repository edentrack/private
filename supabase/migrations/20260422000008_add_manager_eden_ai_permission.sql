ALTER TABLE farm_permissions
  ADD COLUMN IF NOT EXISTS managers_can_use_eden_ai boolean NOT NULL DEFAULT true;
