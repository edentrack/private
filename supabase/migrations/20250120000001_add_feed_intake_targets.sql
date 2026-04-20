-- Add feed intake targets columns to farms table
-- These store custom feed intake targets (g/bird/day) per week for broilers and layers

ALTER TABLE farms
ADD COLUMN IF NOT EXISTS broiler_feed_intake_targets JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS layer_feed_intake_targets JSONB DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN farms.broiler_feed_intake_targets IS 'Custom feed intake targets for broilers (g/bird/day) per week. Format: {"1": 14.5, "2": 19, ...}';
COMMENT ON COLUMN farms.layer_feed_intake_targets IS 'Custom feed intake targets for layers (g/bird/day) per week. Format: {"1": 14.5, "2": 19, ...}';
