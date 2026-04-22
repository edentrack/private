-- Extend farm_permissions with worker-level toggles and split manager analytics from financials

ALTER TABLE farm_permissions
  -- Worker toggles
  ADD COLUMN IF NOT EXISTS workers_can_log_mortality    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS workers_can_log_eggs         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS workers_can_log_weight       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS workers_can_use_eden_ai      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS workers_can_view_financials  boolean NOT NULL DEFAULT false,
  -- Manager additions
  ADD COLUMN IF NOT EXISTS managers_can_use_smart_import boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS managers_can_view_analytics   boolean NOT NULL DEFAULT true;
