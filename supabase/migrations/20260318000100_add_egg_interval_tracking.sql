/*
  Egg Interval Tracking

  Adds interval-aware fields to egg_collections so tasks can sync one egg-entry per interval
  (hourly / every-2-hours) without double counting.
*/

-- Interval start timestamp for interval-based entries (nullable for legacy daily entries)
ALTER TABLE egg_collections
  ADD COLUMN IF NOT EXISTS interval_start_at timestamptz;

-- Link a synced interval entry back to the task completion that created it
ALTER TABLE egg_collections
  ADD COLUMN IF NOT EXISTS source_task_id uuid;

-- Optional: a unique key for idempotency even if interval_start_at changes later
-- (kept text so we can store "HH:MM" or any future bucket id)
ALTER TABLE egg_collections
  ADD COLUMN IF NOT EXISTS source_interval_key text;

-- Indices
CREATE INDEX IF NOT EXISTS idx_egg_collections_interval_start_at
  ON egg_collections(interval_start_at);

-- Ensure one synced egg_collections row per task completion
CREATE UNIQUE INDEX IF NOT EXISTS idx_egg_collections_source_task_id_unique
  ON egg_collections(source_task_id)
  WHERE source_task_id IS NOT NULL;

