-- Ensure feed intake targets columns exist on farms table
-- Fixes: "Could not find the 'broiler_feed_intake_targets' column of 'farms' in the schema cache"

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'farms' AND column_name = 'broiler_feed_intake_targets'
  ) THEN
    ALTER TABLE farms ADD COLUMN broiler_feed_intake_targets JSONB DEFAULT NULL;
    COMMENT ON COLUMN farms.broiler_feed_intake_targets IS 'Custom feed intake targets for broilers (g/bird/day) per week. Format: {"1": 14.5, "2": 19, ...}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'farms' AND column_name = 'layer_feed_intake_targets'
  ) THEN
    ALTER TABLE farms ADD COLUMN layer_feed_intake_targets JSONB DEFAULT NULL;
    COMMENT ON COLUMN farms.layer_feed_intake_targets IS 'Custom feed intake targets for layers (g/bird/day) per week. Format: {"1": 14.5, "2": 19, ...}';
  END IF;
END $$;
