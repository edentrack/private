-- Add bird_count to weight_logs so FCR can use the population at weigh time,
-- not the current live count (which drops as birds die or are sold).
ALTER TABLE weight_logs ADD COLUMN IF NOT EXISTS bird_count integer;

-- Backfill existing rows from the flock's initial_count as a best-effort approximation.
-- More accurate values will be written by the app going forward.
UPDATE weight_logs wl
SET bird_count = f.initial_count
FROM flocks f
WHERE wl.flock_id = f.id AND wl.bird_count IS NULL;
