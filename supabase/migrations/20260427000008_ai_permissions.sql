-- AI permissions per farm — controls what Eden is allowed to do
-- Stored in farm_setup_config to avoid a new table
ALTER TABLE farm_setup_config
  ADD COLUMN IF NOT EXISTS ai_permissions JSONB DEFAULT '{}';
