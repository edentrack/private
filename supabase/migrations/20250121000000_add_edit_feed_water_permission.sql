-- Add managers_can_edit_feed_water permission to farm_permissions table
-- This allows owners to control whether managers can edit feed and water consumption records

ALTER TABLE farm_permissions
ADD COLUMN IF NOT EXISTS managers_can_edit_feed_water boolean DEFAULT false NOT NULL;

-- Update existing records to set default value
UPDATE farm_permissions
SET managers_can_edit_feed_water = false
WHERE managers_can_edit_feed_water IS NULL;
